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
	 * `$facet['value']` may be a single string (the common case -- an
	 * Input or single Select choice) or an array of strings (a
	 * Checkboxes facet with more than one box checked -- see
	 * validate_facets(), the one place that ever produces the array
	 * form). An array value always means "match any of these" (OR'd
	 * together) regardless of `compare` -- matches gateway/facet's own
	 * client-side checkbox behavior (multiple checked boxes OR-match),
	 * which this makes possible server-side too.
	 *
	 * @param array $query_args WP_Query arguments to modify.
	 * @param array $facets     Validated facets, each with at least
	 *                          'key', 'type' ('core'|'meta'|'taxonomy'), 'compare', 'value' (string|string[]).
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
			$compare  = self::sanitize_compare( $facet['compare'] );
			$is_multi = is_array( $facet['value'] );

			if ( 'meta' === $facet['type'] ) {
				$meta_query[] = array(
					'key'     => $facet['key'],
					'value'   => $facet['value'],
					// An array value is always an OR-match across every
					// checked box, regardless of the facet's own compare --
					// same reasoning as the taxonomy branch below.
					'compare' => $is_multi ? 'IN' : $compare,
				);
			} elseif ( 'taxonomy' === $facet['type'] ) {
				// Term membership is inherently binary -- ">"/"LIKE"/etc.
				// from the general compare vocabulary don't have a coherent
				// meaning here, so this only ever distinguishes IN vs. NOT IN.
				// `terms` already accepts an array of slugs natively.
				$tax_query[] = array(
					'taxonomy' => $facet['key'],
					'field'    => 'slug',
					'terms'    => $is_multi ? array_values( $facet['value'] ) : array( $facet['value'] ),
					'operator' => '!=' === $compare ? 'NOT IN' : 'IN',
				);
			} elseif ( self::sanitize_core_column( $facet['key'] ) ) {
				$core_facets[] = array(
					'key'     => $facet['key'],
					'compare' => $is_multi ? 'IN' : $compare,
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
	 * through $wpdb->prepare()'s placeholder(s), never interpolated
	 * directly.
	 *
	 * `'IN'` is a value apply_facets() sets directly (never sanitized
	 * through sanitize_compare()'s own allow-list, which doesn't include
	 * it) whenever a facet's value is an array -- a Checkboxes facet with
	 * more than one box checked. Handled as its own case here: one
	 * placeholder per value, still fully `$wpdb->prepare()`'d.
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
			$column = self::sanitize_core_column( $facet['key'] );

			if ( ! $column ) {
				continue;
			}

			if ( 'IN' === $facet['compare'] ) {
				$values = array_values( array_filter( (array) $facet['value'], 'strlen' ) );

				if ( empty( $values ) ) {
					continue;
				}

				$placeholders = implode( ', ', array_fill( 0, count( $values ), '%s' ) );

				// $column is allow-listed above; every value is its own
				// prepared placeholder, never interpolated.
				$where .= $wpdb->prepare( " AND {$wpdb->posts}.{$column} IN ({$placeholders})", $values ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
				continue;
			}

			$compare = self::sanitize_compare( $facet['compare'] );

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
	 * Layer validated facets onto an Eloquent query builder -- the
	 * Collection counterpart to apply_facets() (which only ever works
	 * against WP_Query args/meta_query/tax_query). A Gateway model's own
	 * fields are just real columns on its own table, so there's only ever
	 * one "type" of column to handle here, unlike apply_facets()'s
	 * meta/taxonomy/core branching.
	 *
	 * `$facet['value']` may be a single string or an array of strings (a
	 * Checkboxes facet with more than one box checked) -- same convention
	 * as apply_facets(), an array value always means "match any of these"
	 * via `whereIn()` regardless of `compare`.
	 *
	 * @param \Illuminate\Database\Eloquent\Builder $query  Query builder to modify.
	 * @param array                                  $facets Validated facets (validate_facets()'s own shape).
	 * @return \Illuminate\Database\Eloquent\Builder
	 */
	public static function apply_collection_facets( $query, array $facets ) {
		foreach ( $facets as $facet ) {
			$key = $facet['key'];

			if ( is_array( $facet['value'] ) ) {
				$values = array_values( array_filter( $facet['value'], 'strlen' ) );

				if ( empty( $values ) ) {
					continue;
				}

				$query->whereIn( $key, $values );
				continue;
			}

			$compare = self::sanitize_compare( $facet['compare'] );

			if ( in_array( $compare, array( 'LIKE', 'NOT LIKE' ), true ) ) {
				// Best-effort wildcard escaping -- unlike $wpdb->esc_like()'s
				// paired ESCAPE clause, Eloquent's fluent where() has no
				// clean way to specify one, so a value that itself contains
				// '%'/'_' can still match more broadly than a visitor might
				// expect. A documented, minor gap, not a safety issue: the
				// value is always parameter-bound by Eloquent regardless.
				$escaped = str_replace( array( '\\', '%', '_' ), array( '\\\\', '\\%', '\\_' ), (string) $facet['value'] );
				$query->where( $key, $compare, '%' . $escaped . '%' );
				continue;
			}

			$query->where( $key, $compare, $facet['value'] );
		}

		return $query;
	}

	/**
	 * get_facet_options()'s own Collection counterpart: distinct values
	 * currently in use for one of a model's own fields, via a real
	 * Eloquent query instead of a direct $wpdb scan. No taxonomy-equivalent
	 * branch -- a Gateway model has no notion of one.
	 *
	 * @param string $class_name Model class name.
	 * @param array  $column     Column definition ('key') from Column_Registry::get_columns_for_collection().
	 * @param int    $limit      Maximum options to return.
	 * @return array[] [ 'value' => string, 'label' => string ][], non-empty, sorted.
	 */
	public static function get_facet_options_for_collection( $class_name, array $column, $limit = 50 ) {
		$limit = max( 1, (int) $limit );

		$cache_key = 'gwdt_cvals_' . md5( $class_name . '|' . $column['key'] . '|' . $limit );
		$cached    = get_transient( $cache_key );

		if ( is_array( $cached ) ) {
			return $cached;
		}

		try {
			$values = $class_name::query()
				->whereNotNull( $column['key'] )
				->where( $column['key'], '!=', '' )
				->distinct()
				->orderBy( $column['key'] )
				->limit( $limit )
				->pluck( $column['key'] )
				->all();
		} catch ( \Throwable $e ) {
			return array();
		}

		$values  = array_values( array_filter( array_map( 'strval', $values ), 'strlen' ) );
		$options = array_map(
			static function ( $value ) {
				return array(
					'value' => $value,
					'label' => $value,
				);
			},
			$values
		);

		set_transient(
			$cache_key,
			$options,
			/** This filter is documented in get_facet_options() above. */
			apply_filters( 'gateway_datatable_facet_values_cache_ttl', 15 * MINUTE_IN_SECONDS, $class_name, $column )
		);

		return $options;
	}

	/**
	 * Validate a raw, client-supplied (or attribute-stored) facet list
	 * against a post type's actual available columns -- the one place
	 * this check happens, shared by every caller that ever hands facets
	 * to apply_facets() with data that didn't originate from trusted PHP
	 * code: `datatable-body/render.php` (the block's own saved `facets`
	 * attribute -- a site owner's own choice, but still validated the
	 * same way any post_content could be hand-edited), `gateway/data-cards/render.php`
	 * (its own saved `facets` attribute, same reasoning), and
	 * `Data_Cards_REST_Controller` (a visitor's live request -- the one
	 * case this is a genuine trust boundary, not just defense in depth).
	 *
	 * Drops a facet entirely (rather than coercing it into something
	 * "safe") whenever: its key isn't in `$available_columns` at all; that
	 * column's `isFilterable` is false; or it resolves to an empty value
	 * (nothing to filter by). Accepts `value` as a string (the common
	 * case) or an array of strings (a Checkboxes facet with more than one
	 * box checked) -- normalizing the array form by dropping empty/non
	 * -string entries, and dropping the whole facet if that empties it too.
	 *
	 * @param array $raw_facets        Untrusted facets, each with at least 'key' and 'value'.
	 * @param array $available_columns Column_Registry::get_columns() results, keyed by column 'key'.
	 * @return array[] Validated facets: [ 'key', 'type', 'compare', 'value' (string|string[]) ][].
	 */
	public static function validate_facets( array $raw_facets, array $available_columns ) {
		$facets = array();

		foreach ( $raw_facets as $requested_facet ) {
			if ( empty( $requested_facet['key'] ) ) {
				continue;
			}

			$key = is_string( $requested_facet['key'] ) ? trim( $requested_facet['key'] ) : '';

			if ( '' === $key || ! isset( $available_columns[ $key ] ) || empty( $available_columns[ $key ]['isFilterable'] ) ) {
				continue;
			}

			$raw_value = $requested_facet['value'] ?? null;

			if ( is_array( $raw_value ) ) {
				$value = array_values(
					array_filter(
						array_map(
							static function ( $item ) {
								return is_scalar( $item ) ? (string) $item : '';
							},
							$raw_value
						),
						'strlen'
					)
				);

				if ( empty( $value ) ) {
					continue;
				}
			} else {
				$value = is_scalar( $raw_value ) ? (string) $raw_value : '';

				if ( '' === $value ) {
					continue;
				}
			}

			$facets[] = array(
				'key'     => $key,
				'type'    => $available_columns[ $key ]['type'],
				'compare' => isset( $requested_facet['compare'] ) ? $requested_facet['compare'] : '=',
				'value'   => $value,
			);
		}

		return $facets;
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

		$values = array_values( array_filter( (array) $values, 'strlen' ) );

		if ( 'core' === $column['type'] && 'post_author' === $column['key'] ) {
			// The raw values here are user IDs, not names -- showing them
			// as-is would make a "post_author" Select/Checkboxes facet
			// list raw numeric IDs as its visible option text. One
			// get_users() call for the whole batch, not one query per ID.
			$users     = get_users(
				array(
					'include' => array_map( 'absint', $values ),
					'fields'  => array( 'ID', 'display_name' ),
				)
			);
			$names_by_id = array();

			foreach ( $users as $user ) {
				$names_by_id[ (string) $user->ID ] = $user->display_name;
			}

			$options = array_map(
				static function ( $value ) use ( $names_by_id ) {
					return array(
						'value' => $value,
						'label' => isset( $names_by_id[ $value ] ) ? $names_by_id[ $value ] : $value,
					);
				},
				$values
			);
		} else {
			$options = array_map(
				static function ( $value ) {
					return array(
						'value' => $value,
						'label' => $value,
					);
				},
				$values
			);
		}

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
