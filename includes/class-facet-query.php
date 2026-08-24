<?php
/**
 * Applies a datatable block's configured facets to a WP_Query.
 *
 * Meta-type facets are layered on as native `meta_query` clauses. Core
 * (WP_Post field) facets have no such built-in mechanism, so they're
 * applied via a `posts_where` filter -- scoped to *only* the query that
 * explicitly opted in (via a private query var set by apply_facets()), so
 * this never touches any other query on the site.
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
	 *                          'key', 'type' ('core'|'meta'), 'compare', 'value'.
	 * @return array Modified query args.
	 */
	public static function apply_facets( array $query_args, array $facets ) {
		if ( empty( $facets ) ) {
			return $query_args;
		}

		$meta_query  = isset( $query_args['meta_query'] ) ? $query_args['meta_query'] : array();
		$core_facets = array();

		foreach ( $facets as $facet ) {
			$compare = self::sanitize_compare( $facet['compare'] );

			if ( 'meta' === $facet['type'] ) {
				$meta_query[] = array(
					'key'     => $facet['key'],
					'value'   => $facet['value'],
					'compare' => $compare,
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
