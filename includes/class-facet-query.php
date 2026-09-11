<?php
/**
 * Applies gateway/data-cards' own configured facets (its top-level
 * Filters panel, plus a visitor's own live gateway/card-facet* input) to
 * a WP_Query or an Eloquent Collection query.
 *
 * Meta-type facets are layered on as native `meta_query` clauses; taxonomy
 * -type facets as native `tax_query` clauses. Core (WP_Post field) facets
 * have no such built-in mechanism, so they're applied via a `posts_where`
 * filter -- scoped to *only* the query that explicitly opted in (via a
 * private query var set by apply_facets()), so this never touches any
 * other query on the site.
 *
 * A handful of this class's own `apply_filters()` hooks still carry a
 * `gateway_datatable_*` name (e.g. `gateway_datatable_facet_values_cache_ttl`
 * below) -- legacy naming kept for filter-hook backward compatibility from
 * when `gateway/datatable` was this class's original, and for a while
 * only, consumer. Renaming a public filter hook is a breaking change for
 * any site already using one, so these names stay as-is even though the
 * block they were named after is gone; see gateway/data-cards' own
 * README changelog entry for the full removal history.
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
	const QUERY_VAR = 'gateway_core_facets';

	/**
	 * Comparison operators safe to interpolate directly into SQL. Never
	 * trust a facet's `compare` value without checking it against this --
	 * it's the only thing standing between a facet and a raw SQL fragment.
	 *
	 * `HAS_VALUE` is not a real SQL operator -- it's never interpolated the
	 * way every other member here is, and carries no comparison value at
	 * all (see validate_facets()' own docblock). It's included in this
	 * list anyway since sanitize_compare() is the one shared "is this a
	 * real, recognized compare" gate every caller already relies on;
	 * apply_facets()/apply_collection_facets()/filter_posts_where() each
	 * branch on it specially before ever reaching the code that treats
	 * every other member as literal SQL.
	 *
	 * `BETWEEN` is the Before/After/Between date-filtering UI's own
	 * "between two dates" mode (`blocks/shared/controls/facet-config-table.js`,
	 * gated to Date/DateTime columns only -- see validate_facets()' own
	 * docblock) -- same non-literal-SQL-operator treatment as `HAS_VALUE`:
	 * its own `value` is never a single scalar but `{from, to}`, and every
	 * caller branches on it specially (`WP_Meta_Query`'s own native
	 * `'compare' => 'BETWEEN'`, Eloquent's `whereBetween()`, or a
	 * hand-written `BETWEEN %s AND %s` for the raw-SQL core-column path)
	 * rather than the generic single-placeholder interpolation every other
	 * member here gets. Before/After themselves need NO new operator at
	 * all -- they reuse the existing `<`/`<=`/`>`/`>=` verbatim, with
	 * `value` either a real date string or the dynamic sentinel `'today'`
	 * (resolved server-side by resolve_dynamic_value(), only for a
	 * Date/DateTime column's own value -- completely inert for every other
	 * field type, so this is a zero-risk addition to those four operators'
	 * existing behavior).
	 */
	const ALLOWED_COMPARE = array( '=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'HAS_VALUE', 'BETWEEN' );

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
		add_action( 'rest_api_init', array( __CLASS__, 'register_editor_preview_query_filter' ) );
	}

	/**
	 * Lets a postType-sourced gateway/data-cards block's own editor preview
	 * (gateway/data-cards-body/src/edit.js, via `getEntityRecords()`) apply
	 * the parent block's configured Filters -- the wp/v2 REST collection
	 * endpoint that preview actually fetches through has no native way to
	 * filter by an arbitrary meta/core column at all (unlike `orderby`,
	 * which IS a real, native param -- see that file's own docblock), so
	 * this registers `rest_{$post_type}_query`, WordPress core's own
	 * documented extension point for exactly this, on every REST-visible
	 * post type.
	 *
	 * Reported directly: a Data Cards grid's Filters setting had no effect
	 * on the editor's own preview at all (correct on the front end, which
	 * never goes through this endpoint -- see Data_Cards_Renderer::
	 * get_query_args()/apply_facets() instead).
	 */
	public static function register_editor_preview_query_filter() {
		foreach ( get_post_types( array( 'show_in_rest' => true ) ) as $post_type ) {
			add_filter( "rest_{$post_type}_query", array( __CLASS__, 'apply_editor_preview_facets' ), 10, 2 );
		}
	}

	/**
	 * The `rest_{$post_type}_query` callback itself -- reads a `gateway_facets`
	 * request param (a JSON-encoded array, same shape/validation as every
	 * other `facets` param this class already handles), re-validates it
	 * against this post type's OWN current columns (Column_Registry::
	 * get_columns()), and layers it onto the WP_Query args exactly like
	 * apply_facets() already does for the real front end.
	 *
	 * A completely inert no-op for every OTHER wp/v2 request on the site --
	 * `gateway_facets` is read via `get_param()` without ever being
	 * declared in this route's own args schema (WP_REST_Request happily
	 * reads any undeclared param; it's simply never populated/validated by
	 * core), so a request that never sends it (which is every request
	 * except this one editor preview) reaches the `empty()` check below and
	 * returns `$args` completely untouched. Never trusted further than
	 * that either: the SAME `isFilterable`/`isHasValueEligible` gate
	 * validate_facets() already enforces for the real, published front end
	 * applies here too -- this never lets a visitor filter by anything a
	 * real gateway/facet(-has-value) block couldn't already filter by.
	 *
	 * @param array            $args    WP_Query arguments being built for this request.
	 * @param \WP_REST_Request $request Current request.
	 * @return array Modified query args.
	 */
	public static function apply_editor_preview_facets( $args, $request ) {
		$raw_facets = json_decode( (string) $request->get_param( 'gateway_facets' ), true );

		if ( empty( $raw_facets ) || ! is_array( $raw_facets ) ) {
			return $args;
		}

		$post_type = isset( $args['post_type'] ) && is_string( $args['post_type'] ) ? $args['post_type'] : 'post';

		$available_columns = array();

		foreach ( Column_Registry::get_columns( $post_type ) as $column ) {
			$available_columns[ $column['key'] ] = $column;
		}

		$facets = self::validate_facets( $raw_facets, $available_columns );

		return self::apply_facets( $args, $facets );
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
			// Resolves a Before/After facet's own dynamic 'today' sentinel
			// fresh on every request -- a complete no-op for a real static
			// date (or any other field type's own value) -- see
			// resolve_dynamic_value()'s own docblock. Done once, up front,
			// so every branch below (meta/taxonomy/core) sees an
			// already-real value, the same way BETWEEN's own two bounds
			// are resolved inside its own branch below.
			if ( is_string( $facet['value'] ) ) {
				$facet['value'] = self::resolve_dynamic_value( $facet['value'], $facet['fieldType'] ?? '' );
			}

			if ( 'BETWEEN' === $facet['compare'] ) {
				$field_type = $facet['fieldType'] ?? '';
				$from       = self::resolve_dynamic_value( $facet['value']['from'], $field_type );
				$to         = self::resolve_dynamic_value( $facet['value']['to'], $field_type );

				if ( 'meta' === $facet['type'] ) {
					// WP_Meta_Query's own native BETWEEN support -- no
					// custom SQL needed. 'type' => DATE/DATETIME (rather
					// than the default CHAR) is what makes the comparison
					// a real date range instead of a lexicographic string
					// one.
					$meta_query[] = array(
						'key'     => $facet['key'],
						'value'   => array( $from, $to ),
						'compare' => 'BETWEEN',
						'type'    => 'datetime' === $field_type ? 'DATETIME' : 'DATE',
					);
				} elseif ( self::sanitize_core_column( $facet['key'] ) ) {
					$core_facets[] = array(
						'key'     => $facet['key'],
						'compare' => 'BETWEEN',
						'value'   => array( $from, $to ),
					);
				}

				// Never a taxonomy facet -- validate_facets() only ever
				// marks a Date/DateTime column's own facet BETWEEN
				// -eligible, and a taxonomy column's own 'type' is never
				// 'date'/'datetime' (Column_Registry never sets 'fieldType'
				// for one).
				continue;
			}

			if ( 'HAS_VALUE' === $facet['compare'] ) {
				if ( 'meta' === $facet['type'] ) {
					// A meta row's own `meta_value` is always plain text
					// (see Column_Registry::get_meta_columns()' own
					// `isHasValueEligible` docblock) -- comparing it to ''
					// with `!=` needs no NUMERIC/CHAR type distinction the
					// way the generic branch below does, and this same
					// clause's own implicit INNER JOIN already excludes a
					// post that never had this meta key set at all, with
					// no separate "key doesn't exist" case to handle.
					$meta_query[] = array(
						'key'     => $facet['key'],
						'value'   => '',
						'compare' => '!=',
					);
				} elseif ( self::sanitize_core_column( $facet['key'] ) ) {
					$core_facets[] = array(
						'key'     => $facet['key'],
						'compare' => 'HAS_VALUE',
						'value'   => '',
					);
				}

				// Never a taxonomy facet -- validate_facets() never marks a
				// taxonomy column isHasValueEligible (see that flag's own
				// docblock in Column_Registry::get_taxonomy_columns()), so
				// this can never actually reach here for one.
				continue;
			}

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
					// WP_Meta_Query defaults to comparing as CHAR -- fine for
					// '='/'LIKE'/etc., but '>'/'>='/'<'/'<=' against a plain
					// string comparison sorts "10" before "9" (lexicographic,
					// not numeric). A meta value being compared with one of
					// those operators is being treated as a number by the
					// person configuring the facet in the first place, so
					// NUMERIC is the correct comparison type whenever one of
					// them is in play.
					'type'    => in_array( $compare, array( '>', '>=', '<', '<=' ), true ) ? 'NUMERIC' : 'CHAR',
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

			if ( 'HAS_VALUE' === $facet['compare'] ) {
				// LENGTH() rather than a plain `!= ''` comparison: every
				// core column this can ever apply to (ALLOWED_CORE_COLUMNS,
				// minus 'ID' -- see Column_Registry::get_core_columns()'
				// own isHasValueEligible) is a wp_posts TEXT/VARCHAR column
				// (never NULL there -- WordPress' own schema defaults every
				// one of them to ''), so LENGTH() > 0 and `!= ''` are
				// equivalent here; LENGTH() is used anyway to stay
				// consistent with apply_collection_facets()'s own identical
				// choice, made there specifically to sidestep MySQL's
				// numeric-string coercion for a Collection's own (sometimes
				// genuinely numeric) columns. No value to prepare/interpolate
				// at all -- $column is the only moving part, already
				// allow-listed above.
				$where .= " AND LENGTH({$wpdb->posts}.{$column}) > 0"; // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
				continue;
			}

			if ( 'BETWEEN' === $facet['compare'] ) {
				// $facet['value'] already carries two REAL, resolved dates
				// by the time it reaches here -- apply_facets() (this
				// query var's own only producer) resolves any 'today'
				// sentinel before ever setting it, earlier in this same
				// request. $column is allow-listed above; both values are
				// still their own prepared placeholders, never interpolated.
				list( $from, $to ) = (array) $facet['value'];
				$where             .= $wpdb->prepare( " AND {$wpdb->posts}.{$column} BETWEEN %s AND %s", $from, $to ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQL.NotPrepared
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

			// Resolves a Before/After facet's own dynamic 'today' sentinel
			// fresh on every request -- see resolve_dynamic_value()'s own
			// docblock. A complete no-op for a real static date (or any
			// other field's own value).
			if ( is_string( $facet['value'] ) ) {
				$facet['value'] = self::resolve_dynamic_value( $facet['value'], $facet['fieldType'] ?? '' );
			}

			if ( 'BETWEEN' === $facet['compare'] ) {
				$field_type = $facet['fieldType'] ?? '';
				$from       = self::resolve_dynamic_value( $facet['value']['from'], $field_type );
				$to         = self::resolve_dynamic_value( $facet['value']['to'], $field_type );

				$query->whereBetween( $key, array( $from, $to ) );
				continue;
			}

			if ( 'HAS_VALUE' === $facet['compare'] ) {
				// LENGTH() > 0, not `whereNotNull($key)->where($key, '!=', '')`:
				// a numeric column (Number/Range, a Relate To One's own FK,
				// True/False's boolean column, ...) compared against the
				// STRING '' gets silently coerced by MySQL -- '' becomes 0
				// for that comparison, so a real, meaningful `0` (or `false`)
				// value would wrongly compare EQUAL to '' and get excluded
				// by mistake (exactly the "0 is set, null isn't" case a
				// direct request called out explicitly). LENGTH(), by
				// contrast, always casts its argument to a string FIRST
				// (LENGTH(0) is 1, LENGTH(NULL) is NULL) -- immune to that
				// coercion regardless of the column's own real type, so no
				// per-field-type branching is needed here at all. $key is
				// never attacker-controlled -- validate_facets() only ever
				// lets through a key that's a real, existing column
				// (Model_Fields' own name-sanitization already limits it to
				// safe identifier characters), the same trust `where( $key,
				// ... )` calls below already place in it unescaped.
				$query->whereRaw( 'LENGTH(`' . $key . '`) > 0' );
				continue;
			}

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
	 * code: `gateway/data-cards/render.php` (its own saved `facets`
	 * attribute -- a site owner's own choice, but still validated the
	 * same way any post_content could be hand-edited), and
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
	 * A `compare` of `HAS_VALUE` (gateway/card-facet-has-value/gateway/
	 * facet-has-value) is a genuinely different shape, handled as its own
	 * branch rather than falling through the rules above: it carries no
	 * `value` at all (there's nothing to compare against -- see this
	 * class's own `ALLOWED_COMPARE` docblock), so the "empty value means
	 * drop it" rule would incorrectly discard every one of these; and its
	 * own field eligibility is `isHasValueEligible`, not `isFilterable` --
	 * deliberately broader (a direct request: "any fields the user makes
	 * from the available field types is suitable"), since a Has Value
	 * check needs none of the value-comparison machinery `isFilterable`
	 * exists to gate (e.g. a Password field is never `isFilterable`, but
	 * "is a password actually set" is still a perfectly meaningful check).
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

			if ( '' === $key || ! isset( $available_columns[ $key ] ) ) {
				continue;
			}

			if ( 'HAS_VALUE' === ( $requested_facet['compare'] ?? '' ) ) {
				if ( empty( $available_columns[ $key ]['isHasValueEligible'] ) ) {
					continue;
				}

				// No real 'value' to carry -- '1' is a non-empty placeholder
				// only, never read by apply_facets()/apply_collection_facets()'s
				// own HAS_VALUE branches (both build their query condition
				// from 'key' alone).
				$facets[] = array(
					'key'     => $key,
					'type'    => $available_columns[ $key ]['type'],
					'compare' => 'HAS_VALUE',
					'value'   => '1',
				);
				continue;
			}

			// The Before/After/Between date-filtering UI's own "Between"
			// mode -- a genuinely different shape from every other facet
			// here (an associative `{from, to}` value, not a scalar or a
			// sequential OR-match array), so -- same reasoning as the
			// HAS_VALUE branch just above -- it's handled as its own
			// branch, checked BEFORE the generic isFilterable/is_array()
			// handling below. That ordering isn't cosmetic: a JSON-decoded
			// `{"from":...,"to":...}` object is a plain PHP array like any
			// other, indistinguishable from the generic branch's own
			// "array means OR-match checkboxes" case, so BETWEEN must be
			// intercepted here first or it would silently be reinterpreted
			// as one instead.
			if ( 'BETWEEN' === ( $requested_facet['compare'] ?? '' ) ) {
				$field_type = $available_columns[ $key ]['fieldType'] ?? '';

				// "Between two dates" has no coherent meaning for
				// text/number/select the way HAS_VALUE's universal
				// isHasValueEligible does -- gated to Date/DateTime
				// specifically, deliberately narrower.
				if ( ! in_array( $field_type, array( 'date', 'datetime' ), true ) ) {
					continue;
				}

				$raw_value = $requested_facet['value'] ?? array();
				$from      = is_scalar( $raw_value['from'] ?? null ) ? trim( (string) $raw_value['from'] ) : '';
				$to        = is_scalar( $raw_value['to'] ?? null ) ? trim( (string) $raw_value['to'] ) : '';

				if ( '' === $from || '' === $to ) {
					// A one-sided range isn't "between" at all -- Before/After
					// already cover that, with their own single-value shape.
					continue;
				}

				$facets[] = array(
					'key'       => $key,
					'type'      => $available_columns[ $key ]['type'],
					'compare'   => 'BETWEEN',
					'value'     => array(
						'from' => $from,
						'to'   => $to,
					),
					'fieldType' => $field_type,
				);
				continue;
			}

			if ( empty( $available_columns[ $key ]['isFilterable'] ) ) {
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
				'key'       => $key,
				'type'      => $available_columns[ $key ]['type'],
				'compare'   => isset( $requested_facet['compare'] ) ? $requested_facet['compare'] : '=',
				'value'     => $value,
				// Carried through so apply_facets()/apply_collection_facets()
				// can resolve a Before/After 'today' sentinel without a
				// second Column_Registry lookup -- see resolve_dynamic_value()'s
				// own docblock. A no-op key for every non-date field.
				'fieldType' => $available_columns[ $key ]['fieldType'] ?? '',
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
	 * Resolves the Before/After/Between date-filtering UI's own dynamic
	 * "Today" sentinel (the literal string `'today'`) to a real date,
	 * fresh on every call -- unlike Date_Field_Type's own similarly-named
	 * `'today'` sentinel (a RECORD-CREATION default value, resolved ONCE,
	 * client-side, when an "Add New" form opens -- see that class's own
	 * docblock), this one is resolved server-side, on every real request
	 * that applies facets at all (apply_facets()/apply_collection_facets()
	 * are never cached across requests), so "today" always means the
	 * moment a visitor is actually loading the page -- never a stale date
	 * baked in whenever the facet was configured.
	 *
	 * A complete no-op for anything that isn't literally `'today'`, or for
	 * a column that isn't Date/DateTime -- a static date value (the
	 * overwhelming common case, and the ONLY case for every field type
	 * this shipped before this feature existed) passes straight through
	 * unchanged, so this is a zero-regression-risk addition to the
	 * existing `<`/`<=`/`>`/`>=` operators' own behavior.
	 *
	 * @param mixed  $value      A facet's raw value (one bound, for Before/After/Between alike).
	 * @param string $field_type Column_Registry's own `fieldType` ('date'/'datetime'/''/etc.) -- the
	 *                            raw Gateway Field_Type::key(), not an HTML `<input>` type.
	 * @return mixed The resolved value -- current_time()'s own site-timezone-aware "now," formatted to match
	 *               that field type's own canonical cast() shape, or $value unchanged.
	 */
	protected static function resolve_dynamic_value( $value, $field_type ) {
		if ( 'today' !== $value || ! in_array( $field_type, array( 'date', 'datetime' ), true ) ) {
			return $value;
		}

		return 'datetime' === $field_type ? current_time( 'mysql' ) : current_time( 'Y-m-d' );
	}

	/**
	 * @param mixed $column Requested core column key.
	 * @return string|false The column if it's allow-listed, false otherwise.
	 */
	protected static function sanitize_core_column( $column ) {
		return in_array( $column, self::ALLOWED_CORE_COLUMNS, true ) ? $column : false;
	}
}
