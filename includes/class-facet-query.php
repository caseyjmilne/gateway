<?php
/**
 * Applies a datatable block's configured facets to a WP_Query.
 *
 * Meta-type facets are layered on as native `meta_query` clauses; taxonomy
 * -type facets as native `tax_query` clauses. Core (WP_Post field) facets
 * have no such built-in mechanism, so they're applied via a `posts_where`
 * filter -- scoped to *only* the query that explicitly opted in (via a
 * private query var set by apply_facets()), so this never touches any
 * other query on the site.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Facet_Query {

	/**
	 * Private WP_Query var used to pass core-field facets through to
	 * filter_posts_where() without touching any other query.
	 */
	const QUERY_VAR = 'gateway_datatable_core_facets';

	/**
	 * Comparison operators safe to interpolate directly into SQL. Never
	 * trust a facet's `compare` value without checking it against this --
	 * it's the only thing standing between a facet and a raw SQL fragment.
	 */
	const ALLOWED_COMPARE = array( '=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE' );

	/**
	 * wp_posts columns safe to interpolate directly into SQL -- matches
	 * Column_Registry's default core columns, but deliberately does *not*
	 * follow the `gateway_datatable_core_columns` filter the way that list
	 * does: this one exists purely as a SQL-injection safety boundary, and
	 * letting arbitrary filtered-in column names widen it would defeat the
	 * point. A site adding a custom core column via that filter can filter
	 * by it too by adding it here (a deliberate, explicit code change),
	 * just not automatically through the same filter. Never trust a
	 * facet's `key` for a core-type facet without checking it against this.
	 */
	const ALLOWED_CORE_COLUMNS = array(
		'ID',
		'post_title',
		'post_content',
		'post_excerpt',
		'post_date',
		'post_modified',
		'post_author',
		'post_status',
		'post_name',
		'post_parent',
		'menu_order',
		'comment_count',
	);

	/**
	 * Hook the scoped posts_where filter into WordPress.
	 */
	public static function init() {
		add_filter( 'posts_where', array( __CLASS__, 'filter_posts_where' ), 10, 2 );
	}

	/**
	 * Layer validated facets onto a set of WP_Query args.
	 *
	 * @param array $query_args WP_Query arguments to modify.
	 * @param array $facets     Validated facets, each with at least
	 *                          'key', 'type' ('core'|'meta'|'taxonomy'), 'compare', 'value'.
	 * @return array Modified query args.
	 */
	public static function apply_facets( array $query_args, array $facets ) {
		if ( empty( $facets ) ) {
			return $query_args;
		}

		$meta_query  = isset( $query_args['meta_query'] ) ? $query_args['meta_query'] : array();
		$tax_query   = isset( $query_args['tax_query'] ) ? $query_args['tax_query'] : array();
		$core_facets = array();

		foreach ( $facets as $facet ) {
			$compare = self::sanitize_compare( $facet['compare'] );

			if ( 'meta' === $facet['type'] ) {
				$meta_query[] = array(
					'key'     => $facet['key'],
					'value'   => $facet['value'],
					'compare' => $compare,
				);
			} elseif ( 'taxonomy' === $facet['type'] ) {
				// Term membership is inherently binary -- ">"/"LIKE"/etc.
				// from the general compare vocabulary don't have a coherent
				// meaning here, so this only ever distinguishes IN vs. NOT IN.
				$tax_query[] = array(
					'taxonomy' => $facet['key'],
					'field'    => 'slug',
					'terms'    => array( $facet['value'] ),
					'operator' => '!=' === $compare ? 'NOT IN' : 'IN',
				);
			} elseif ( self::sanitize_core_column( $facet['key'] ) ) {
				$core_facets[] = array(
					'key'     => $facet['key'],
					'compare' => $compare,
					'value'   => $facet['value'],
				);
			}
		}

		if ( $meta_query ) {
			$query_args['meta_query'] = $meta_query; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
		}

		if ( $tax_query ) {
			$query_args['tax_query'] = $tax_query; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		}

		if ( $core_facets ) {
			// A plain query var, not a real WP_Query feature -- just a way
			// to hand these to filter_posts_where() via $query->get(), and
			// to scope that filter to only queries that set it.
			$query_args[ self::QUERY_VAR ] = $core_facets;
		}

		return $query_args;
	}

	/**
	 * Adds WHERE clauses for a query's core-field facets, if it has any
	 * (via the private query var apply_facets() sets). Every column and
	 * comparison operator is checked against a fixed allow-list before
	 * ever being placed into the SQL string; the value is always passed
	 * through $wpdb->prepare()'s placeholder, never interpolated directly.
	 *
	 * @param string    $where WHERE clause built so far.
	 * @param \WP_Query $query Current query.
	 * @return string
	 */
	public static function filter_posts_where( $where, $query ) {
		$facets = $query->get( self::QUERY_VAR );

		if ( empty( $facets ) || ! is_array( $facets ) ) {
			return $where;
		}

		global $wpdb;

		foreach ( $facets as $facet ) {
			$column  = self::sanitize_core_column( $facet['key'] );
			$compare = self::sanitize_compare( $facet['compare'] );

			if ( ! $column ) {
				continue;
			}

			$value = in_array( $compare, array( 'LIKE', 'NOT LIKE' ), true )
				? '%' . $wpdb->esc_like( $facet['value'] ) . '%'
				: $facet['value'];

			// $column and $compare are both allow-listed above; $value is
			// always the prepared placeholder, never interpolated.
			$where .= $wpdb->prepare( " AND {$wpdb->posts}.{$column} {$compare} %s", $value ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
		}

		return $where;
	}

	/**
	 * Options for populating a "select" or "checkboxes" gateway/facet block:
	 * for core/meta columns, distinct values currently in use (`value` and
	 * `label` are the same string); for taxonomy columns, the taxonomy's
	 * actual terms (`value` is the term slug -- what gets matched against;
	 * `label` is the term name -- what's shown). Capped and cached (like
	 * Column_Registry's column discovery) since core/meta options are
	 * discovered by scanning the relevant table directly.
	 *
	 * @param string $post_type Post type slug.
	 * @param array  $column    Column definition ('key', 'type') from Column_Registry.
	 * @param int    $limit     Maximum options to return.
	 * @return array[] [ 'value' => string, 'label' => string ][], non-empty, sorted by label.
	 */
	public static function get_facet_options( $post_type, array $column, $limit = 50 ) {
		$limit = max( 1, (int) $limit );

		if ( 'taxonomy' === $column['type'] ) {
			$terms = get_terms(
				array(
					'taxonomy'   => $column['key'],
					'hide_empty' => true,
					'number'     => $limit,
				)
			);

			if ( is_wp_error( $terms ) ) {
				return array();
			}

			return array_map(
				static function ( $term ) {
					return array(
						'value' => $term->slug,
						'label' => $term->name,
					);
				},
				$terms
			);
		}

		$cache_key = 'gwdt_vals_' . md5( $post_type . '|' . $column['key'] . '|' . $column['type'] . '|' . $limit );
		$cached    = get_transient( $cache_key );

		if ( is_array( $cached ) ) {
			return $cached;
		}

		global $wpdb;

		if ( 'meta' === $column['type'] ) {
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$values = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT DISTINCT pm.meta_value
					FROM {$wpdb->postmeta} pm
					INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
					WHERE p.post_type = %s AND pm.meta_key = %s AND pm.meta_value != ''
					ORDER BY pm.meta_value ASC
					LIMIT %d",
					$post_type,
					$column['key'],
					$limit
				)
			);
			// phpcs:enable
		} else {
			$core_column = self::sanitize_core_column( $column['key'] );

			if ( ! $core_column ) {
				return array();
			}

			// $core_column is allow-listed above -- the only thing making
			// direct interpolation into the SQL string here safe.
			// phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$values = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT DISTINCT {$wpdb->posts}.{$core_column}
					FROM {$wpdb->posts}
					WHERE post_type = %s AND {$wpdb->posts}.{$core_column} != ''
					ORDER BY {$wpdb->posts}.{$core_column} ASC
					LIMIT %d",
					$post_type,
					$limit
				)
			);
			// phpcs:enable
		}

		$options = array_map(
			static function ( $value ) {
				return array(
					'value' => $value,
					'label' => $value,
				);
			},
			array_values( array_filter( (array) $values, 'strlen' ) )
		);

		set_transient(
			$cache_key,
			$options,
			/**
			 * Filters how long (in seconds) a facet's option list is cached.
			 *
			 * @param int    $ttl       Cache TTL in seconds.
			 * @param string $post_type Post type slug.
			 * @param array  $column    Column definition.
			 */
			apply_filters( 'gateway_datatable_facet_values_cache_ttl', 15 * MINUTE_IN_SECONDS, $post_type, $column )
		);

		return $options;
	}

	/**
	 * @param mixed $compare Requested compare operator.
	 * @return string A member of ALLOWED_COMPARE -- '=' if not.
	 */
	protected static function sanitize_compare( $compare ) {
		return in_array( $compare, self::ALLOWED_COMPARE, true ) ? $compare : '=';
	}

	/**
	 * @param mixed $column Requested core column key.
	 * @return string|false The column if it's allow-listed, false otherwise.
	 */
	protected static function sanitize_core_column( $column ) {
		return in_array( $column, self::ALLOWED_CORE_COLUMNS, true ) ? $column : false;
	}
}
