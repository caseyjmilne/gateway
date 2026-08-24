<?php
/**
 * Discovers the columns available for a post type (core WP_Post fields +
 * registered/discovered post meta -- including custom fields added by
 * plugins like ACF, discovered via WordPress core APIs only, never a
 * specific plugin's own API), maps them to friendly labels, and knows how
 * to render a cell value for a given column.
 *
 * Single source of truth used by both Columns_REST_Controller (what the
 * block editor's column picker offers) and blocks/datatable/render.php
 * (validating the columns a block instance actually asks for, and
 * rendering their values) -- so a column key can never make it into the
 * grid unless it's one this class actually recognizes for that post type.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Column_Registry {

	/**
	 * How long the discovered column list is cached per post type. Mainly a
	 * safety-net ceiling -- flush_cache_on_save() actively invalidates it
	 * on every post save, which is when a newly-populated meta key (e.g. a
	 * custom field filled in for the first time) actually needs to become
	 * visible.
	 */
	const CACHE_TTL = 15 * MINUTE_IN_SECONDS;

	/**
	 * Hook cache invalidation into WordPress.
	 */
	public static function init() {
		add_action( 'save_post', array( __CLASS__, 'flush_cache_on_save' ) );
	}

	/**
	 * Invalidate a post type's cached column list whenever a post of that
	 * type is saved -- covers the common case of a custom field (meta key)
	 * being populated for the first time, which the cached list wouldn't
	 * otherwise pick up until it expires on its own.
	 *
	 * @param int $post_id Post ID being saved.
	 */
	public static function flush_cache_on_save( $post_id ) {
		$post_type = get_post_type( $post_id );

		if ( $post_type ) {
			self::flush_cache( $post_type );
		}
	}

	/**
	 * Get every available column for a post type: core WP_Post fields plus
	 * registered/discovered post meta, each as:
	 * [ 'key' => string, 'label' => string, 'type' => 'core'|'meta' ].
	 *
	 * @param string $post_type Post type slug.
	 * @return array[] Column definitions.
	 */
	public static function get_columns( $post_type ) {
		if ( ! post_type_exists( $post_type ) ) {
			return array();
		}

		$cache_key = 'gateway_datatable_columns_' . $post_type;
		$cached    = get_transient( $cache_key );

		if ( is_array( $cached ) ) {
			return $cached;
		}

		$columns = array_merge(
			self::get_core_columns( $post_type ),
			self::get_meta_columns( $post_type )
		);

		set_transient(
			$cache_key,
			$columns,
			/**
			 * Filters how long (in seconds) discovered columns are cached
			 * for a post type. Meta-key discovery scans wp_postmeta, so
			 * this trades a little staleness (new meta keys can take up to
			 * this long to appear in the picker) for not re-scanning on
			 * every block-editor keystroke.
			 *
			 * @param int    $ttl       Cache TTL in seconds.
			 * @param string $post_type Post type slug.
			 */
			apply_filters( 'gateway_datatable_columns_cache_ttl', self::CACHE_TTL, $post_type )
		);

		return $columns;
	}

	/**
	 * Look up a single column's definition for a post type, or null if
	 * that key isn't a recognized column for it.
	 *
	 * @param string $post_type Post type slug.
	 * @param string $key       Column key.
	 * @return array|null
	 */
	public static function get_column( $post_type, $key ) {
		foreach ( self::get_columns( $post_type ) as $column ) {
			if ( $column['key'] === $key ) {
				return $column;
			}
		}

		return null;
	}

	/**
	 * Clear the cached column list for a post type (e.g. after registering
	 * new meta at runtime and wanting it to show up immediately).
	 *
	 * @param string $post_type Post type slug.
	 */
	public static function flush_cache( $post_type ) {
		delete_transient( 'gateway_datatable_columns_' . $post_type );
	}

	/**
	 * Core WP_Post fields worth offering as columns, with friendly labels.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_core_columns( $post_type ) {
		/**
		 * Filters the core (WP_Post field) columns offered for a post type.
		 * Keys are WP_Post property names; values are their friendly labels.
		 *
		 * @param array  $labels    Map of field key => friendly label.
		 * @param string $post_type Post type slug.
		 */
		$labels = apply_filters(
			'gateway_datatable_core_columns',
			array(
				'ID'            => __( 'ID', 'gateway' ),
				'post_title'    => __( 'Title', 'gateway' ),
				'post_content'  => __( 'Content', 'gateway' ),
				'post_excerpt'  => __( 'Excerpt', 'gateway' ),
				'post_date'     => __( 'Date', 'gateway' ),
				'post_modified' => __( 'Modified', 'gateway' ),
				'post_author'   => __( 'Author', 'gateway' ),
				'post_status'   => __( 'Status', 'gateway' ),
				'post_name'     => __( 'Slug', 'gateway' ),
				'post_parent'   => __( 'Parent ID', 'gateway' ),
				'menu_order'    => __( 'Order', 'gateway' ),
				'comment_count' => __( 'Comments', 'gateway' ),
			),
			$post_type
		);

		// "Parent ID" only makes sense for hierarchical post types (pages,
		// and any custom hierarchical CPT) -- post_parent isn't meaningful
		// for posts or other flat post types, so don't offer it as a column
		// for them.
		if ( ! is_post_type_hierarchical( $post_type ) ) {
			unset( $labels['post_parent'] );
		}

		$columns = array();

		foreach ( $labels as $key => $label ) {
			$columns[] = array(
				'key'   => $key,
				'label' => $label,
				'type'  => 'core',
			);
		}

		return $columns;
	}

	/**
	 * Meta columns available for a post type: formally registered meta
	 * (register_post_meta() -- including anything ACF registers this way
	 * when a field group's "Show in REST API" setting is turned on) merged
	 * with meta keys actually found on a recent sample of posts of this
	 * type (to also surface fields, including ACF's, that were never
	 * formally registered -- the common case). WordPress core only,
	 * deliberately: no ACF (or any other plugin's) API is called directly,
	 * so this works identically whether or not ACF -- or any specific
	 * field-builder plugin -- is even active. Protected meta (WordPress'
	 * "starts with an underscore" convention -- also how ACF stores its
	 * internal field-key references) is excluded, as are a handful of
	 * WordPress-internal meta keys that would otherwise slip through (see
	 * get_excluded_meta_keys()).
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_meta_columns( $post_type ) {
		$meta_keys = array();

		foreach ( array_keys( get_registered_meta_keys( 'post', $post_type ) ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		foreach ( self::get_used_meta_keys( $post_type ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		$excluded_keys = self::get_excluded_meta_keys( $post_type );
		$columns       = array();

		foreach ( array_keys( $meta_keys ) as $key ) {
			if ( '' === $key || is_protected_meta( $key, 'post' ) || in_array( $key, $excluded_keys, true ) ) {
				continue;
			}

			$columns[] = array(
				'key'   => $key,
				/**
				 * Filters the friendly label for a meta column. Meta keys
				 * have no built-in "nice name" the way core fields do, so
				 * by default this just humanizes the raw key -- sites can
				 * hook this to supply real field labels instead (e.g. for
				 * their own ACF fields).
				 *
				 * @param string $label     Humanized label.
				 * @param string $key       Raw meta key.
				 * @param string $post_type Post type slug.
				 */
				'label' => apply_filters( 'gateway_datatable_column_label', self::humanize( $key ), $key, $post_type ),
				'type'  => 'meta',
			);
		}

		usort(
			$columns,
			static function ( $a, $b ) {
				return strcasecmp( $a['label'], $b['label'] );
			}
		);

		return $columns;
	}

	/**
	 * Meta keys actually in use on posts of this type, via get_post_meta()
	 * on a recent sample -- rather than a hand-written SQL scan of
	 * wp_postmeta, this uses only core APIs: get_posts() to pick the
	 * sample, update_meta_cache() to prime it in one batched query (the
	 * same priming WP_Query itself normally does), then get_post_meta()
	 * per post (cheap array reads against that now-primed cache, not
	 * additional queries).
	 *
	 * Deliberately a *sample* (most recently modified posts first, capped
	 * -- see the filter below) rather than every post of the type: for a
	 * post type with many posts, discovering "what meta keys exist" this
	 * way needs to stay cheap enough to run from an admin screen. A key
	 * used on any reasonably-recently-touched post will surface; one that
	 * exists solely on posts entirely outside the sample won't, until one
	 * of them is next saved (which also busts the cache -- see init()).
	 *
	 * @param string $post_type Post type slug.
	 * @return string[] Meta keys found.
	 */
	protected static function get_used_meta_keys( $post_type ) {
		$post_ids = get_posts(
			array(
				'post_type'      => $post_type,
				'post_status'    => 'any',
				/**
				 * Filters how many of a post type's most recently modified
				 * posts are scanned for in-use meta keys.
				 *
				 * @param int    $sample_size Number of posts to scan.
				 * @param string $post_type   Post type slug.
				 */
				'posts_per_page' => apply_filters( 'gateway_datatable_meta_scan_sample_size', 200, $post_type ),
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);

		if ( ! $post_ids ) {
			return array();
		}

		update_meta_cache( 'post', $post_ids );

		$keys = array();

		foreach ( $post_ids as $post_id ) {
			foreach ( array_keys( get_post_meta( $post_id ) ) as $key ) {
				$keys[ $key ] = true;
			}
		}

		return array_keys( $keys );
	}

	/**
	 * Meta keys that are technically real, unprotected post meta but are
	 * WordPress core's or a plugin's own internals rather than actual
	 * content -- not offered as columns even though they'd otherwise pass
	 * the "not protected" check (they don't start with an underscore).
	 *
	 * @param string $post_type Post type slug.
	 * @return string[]
	 */
	protected static function get_excluded_meta_keys( $post_type ) {
		/**
		 * Filters meta keys excluded from the column picker despite not
		 * being "protected" meta.
		 *
		 * @param string[] $excluded_keys Excluded meta keys.
		 * @param string   $post_type     Post type slug.
		 */
		return apply_filters(
			'gateway_datatable_excluded_meta_keys',
			array(
				// The block editor's Footnotes feature: WordPress core
				// itself register_post_meta()'s this (show_in_rest, so the
				// editor can save it) for any post type supporting the
				// block editor -- it's real meta, but editor internals, not
				// content a site owner would want as a grid column.
				'footnotes',
			),
			$post_type
		);
	}

	/**
	 * Turn a raw key like "event_start_date" into "Event Start Date".
	 *
	 * @param string $key Raw key.
	 * @return string
	 */
	protected static function humanize( $key ) {
		return ucwords( str_replace( array( '_', '-' ), ' ', $key ) );
	}

	/**
	 * Render a single column's value for a post, as a plain display string
	 * (already appropriate to escape and output -- callers still need to
	 * esc_html() it, this just resolves *what* to show).
	 *
	 * @param int   $post_id Post ID.
	 * @param array $column  Column definition from get_columns()/get_column().
	 * @return string
	 */
	public static function get_cell_value( $post_id, array $column ) {
		if ( 'meta' === $column['type'] ) {
			$value = get_post_meta( $post_id, $column['key'], true );
			return self::stringify( $value );
		}

		switch ( $column['key'] ) {
			case 'post_title':
				$title = get_the_title( $post_id );
				return '' !== $title ? $title : __( '(no title)', 'gateway' );

			case 'post_content':
				return wp_trim_words( wp_strip_all_tags( get_post_field( 'post_content', $post_id ) ), 20 );

			case 'post_excerpt':
				return wp_strip_all_tags( get_the_excerpt( $post_id ) );

			case 'post_date':
			case 'post_modified':
				$raw = get_post_field( $column['key'], $post_id );
				return $raw ? mysql2date( get_option( 'date_format' ), $raw ) : '';

			case 'post_author':
				return get_the_author_meta( 'display_name', get_post_field( 'post_author', $post_id ) );

			case 'post_status':
				$status_object = get_post_status_object( get_post_status( $post_id ) );
				return $status_object ? $status_object->label : get_post_status( $post_id );

			default:
				return self::stringify( get_post_field( $column['key'], $post_id ) );
		}
	}

	/**
	 * Coerce an arbitrary meta/field value into a safe display string.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	protected static function stringify( $value ) {
		if ( is_array( $value ) || is_object( $value ) ) {
			return wp_json_encode( $value );
		}

		if ( is_bool( $value ) ) {
			return $value ? __( 'Yes', 'gateway' ) : __( 'No', 'gateway' );
		}

		return (string) $value;
	}
}
