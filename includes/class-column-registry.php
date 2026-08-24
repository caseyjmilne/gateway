<?php
/**
 * Discovers the columns available for a post type (core WP_Post fields +
 * registered/discovered meta, e.g. ACF fields), maps them to friendly
 * labels, and knows how to render a cell value for a given column.
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
	 * How long the discovered column list is cached per post type.
	 */
	const CACHE_TTL = 15 * MINUTE_IN_SECONDS;

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
	 * (register_post_meta(), including anything ACF registers when its
	 * "Show in REST API" support is enabled) merged with meta keys actually
	 * found on posts of this type (to also surface ACF/other fields that
	 * were never formally registered). Protected meta (WordPress' own
	 * "starts with an underscore" convention -- also used by ACF for its
	 * internal field-key references) is excluded.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_meta_columns( $post_type ) {
		global $wpdb;

		$meta_keys = array();

		foreach ( array_keys( get_registered_meta_keys( 'post', $post_type ) ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$found_keys = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT DISTINCT pm.meta_key
				FROM {$wpdb->postmeta} pm
				INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
				WHERE p.post_type = %s",
				$post_type
			)
		);
		// phpcs:enable

		foreach ( (array) $found_keys as $key ) {
			$meta_keys[ $key ] = true;
		}

		$columns = array();

		foreach ( array_keys( $meta_keys ) as $key ) {
			if ( '' === $key || is_protected_meta( $key, 'post' ) ) {
				continue;
			}

			$columns[] = array(
				'key'   => $key,
				/**
				 * Filters the friendly label for a meta column. Meta keys
				 * have no built-in "nice name" the way core fields do, so
				 * by default this just humanizes the raw key -- sites (or
				 * an ACF-aware integration) can hook this to supply real
				 * field labels instead.
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
