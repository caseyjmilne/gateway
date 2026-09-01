<?php
/**
 * REST API routes for the admin app's Records screen -- plain CRUD
 * against one model's actual rows (as opposed to Model_REST_Controller,
 * which manages the model/migration itself, and Model_Field_REST_Controller,
 * which manages its field *definitions*). This is the one controller in
 * the whole Models/Fields/Records trio that actually touches row data.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Records_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Default/maximum rows per page for the list endpoint.
	 */
	const DEFAULT_PER_PAGE = 20;
	const MAX_PER_PAGE     = 100;

	/**
	 * Maximum results returned by the autocomplete search route -- same
	 * cap Facet_Query::get_facet_options() already uses for its own
	 * discovered-values list, for the same reason: an autocomplete only
	 * ever needs "enough to be useful," not every matching row.
	 */
	const SEARCH_LIMIT = 20;

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET/POST      /gateway/v1/models/<class>/records
	 * GET/PUT/DELETE /gateway/v1/models/<class>/records/<id>
	 * GET           /gateway/v1/models/<class>/records/search
	 *
	 * Record create/update bodies are deliberately NOT given a fixed
	 * 'args' schema -- unlike every other route in this plugin, the set
	 * of valid keys here is dynamic (whatever Model_Fields::all()
	 * currently returns for this specific model), so it's read straight
	 * from the request body and filtered through
	 * Model_Fields::sanitize_record_data() inside the callback instead.
	 *
	 * `/records/search` is registered as its own route rather than a
	 * query param on `/records` -- it needs a genuinely different
	 * response shape ({id, label} pairs, not full record data) and
	 * powers a different UI (RelateAutocomplete.jsx's search-as-you-type,
	 * not the Records table) -- and it's matched before
	 * `/records/(?P<id>\d+)` could ever conflict with it: that pattern
	 * only matches digits, so the literal path segment "search" never
	 * reaches it regardless of registration order.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/records',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'list_records' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'create_record' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/records/search',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'search_records' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'q'       => array(
						'required' => false,
						'type'     => 'string',
						'default'  => '',
					),
					'exclude' => array(
						'required' => false,
						'type'     => 'string',
						'default'  => '',
						// Comma-separated ids -- e.g. RelateAutocomplete.jsx
						// excluding a Relate to Many field's own
						// already-selected records from further search
						// results. A plain string, not a REST 'array' param
						// with 'items', to match how every id-list this
						// admin app sends around (fields-order's own
						// `order`, a Relate to Many field's submitted
						// value) is already just handled as a plain array
						// client-side -- kept a query-string-friendly
						// comma-joined string here specifically because
						// this is the one place that value travels as a
						// GET param, not a JSON body.
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/records/(?P<id>\d+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_record' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'update_record' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'delete_record' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/records/(?P<id>\d+)/relationships/(?P<method>[A-Za-z0-9_]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_related_records' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'per_page' => array(
						'required' => false,
						'type'     => 'integer',
						'default'  => self::DEFAULT_PER_PAGE,
					),
				),
			)
		);
	}

	/**
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway records.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function list_records( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$page     = max( 1, (int) $request->get_param( 'page' ) );
		$per_page = (int) $request->get_param( 'per_page' );
		$per_page = $per_page > 0 ? min( self::MAX_PER_PAGE, $per_page ) : self::DEFAULT_PER_PAGE;

		list( $orderby, $order ) = self::resolve_sort( $class, $request );

		try {
			$total   = $class::count();
			$records = $class::orderBy( $orderby, $order )->forPage( $page, $per_page )->get();
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_records_query_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'records'  => self::enrich_records( $class, $records ),
				'total'    => $total,
				'page'     => $page,
				'per_page' => $per_page,
				// The sort ACTUALLY applied, not necessarily whatever was
				// requested -- an invalid/no-longer-sortable `orderby`
				// silently falls back rather than erroring (see
				// resolve_sort()'s own docblock), so RecordsCrud.jsx reads
				// this back to keep its own column-header sort indicator
				// honest about what the response actually reflects.
				'orderby'  => $orderby,
				'order'    => $order,
			)
		);
	}

	/**
	 * Validates the request's own `orderby`/`order` against what's
	 * actually safe and meaningful to sort `$class` by right now, rather
	 * than passing a client-supplied column name straight to `orderBy()`
	 * unchecked -- the same "never trust the client's own picker/request
	 * blindly" discipline every other write path in this plugin already
	 * follows (e.g. gateway/card-field-text's render.php re-validating
	 * `fieldKey` against the model's live columns).
	 *
	 * `id` is always allowed, matching this endpoint's own long-standing
	 * default. Any other `orderby` must be BOTH one of `$class`'s own
	 * CURRENT fields (a stale key -- renamed or removed since -- must
	 * never reach a raw SQL `ORDER BY`) AND explicitly marked `sortable`
	 * in this model's own Columns configuration (`Model_Columns::get()`)
	 * -- an unconfigured model (`get()` returns null) allows nothing
	 * beyond `id`, preserving today's exact pre-existing behavior for
	 * every model that hasn't opted into this feature at all yet.
	 *
	 * Falls back to `[ 'id', 'desc' ]` -- this endpoint's own original,
	 * unconditional default -- for a missing, invalid, or no-longer
	 * -eligible `orderby`, and for any `order` other than literally
	 * `'asc'`, rather than erroring: a bookmarked/stale sorted URL should
	 * degrade gracefully, not break the whole listing.
	 *
	 * @param string            $class   Model class name.
	 * @param \WP_REST_Request $request Request.
	 * @return array{0:string,1:string} [ orderby, order ].
	 */
	private static function resolve_sort( $class, \WP_REST_Request $request ) {
		$orderby = (string) $request->get_param( 'orderby' );
		$order   = 'asc' === strtolower( (string) $request->get_param( 'order' ) ) ? 'asc' : 'desc';

		if ( 'id' === $orderby ) {
			return array( 'id', $order );
		}

		$columns_config = Model_Columns::get( $class );
		$sortable_keys  = array();

		if ( $columns_config ) {
			foreach ( $columns_config as $column ) {
				if ( ! empty( $column['sortable'] ) ) {
					$sortable_keys[] = $column['key'];
				}
			}
		}

		if ( '' === $orderby || ! in_array( $orderby, $sortable_keys, true ) ) {
			return array( 'id', 'desc' );
		}

		// Belt-and-suspenders: $sortable_keys only ever came from a
		// Columns config that Model_Columns::set() already validated
		// against Model_Fields::all() at SAVE time -- but a field could
		// have been renamed or removed since without Columns being
		// re-saved, and a stale key must never reach a raw SQL ORDER BY.
		$current_field_names = wp_list_pluck( Model_Fields::all( $class ), 'name' );

		if ( ! in_array( $orderby, $current_field_names, true ) ) {
			return array( 'id', 'desc' );
		}

		return array( $orderby, $order );
	}

	/**
	 * GET /gateway/v1/models/<class>/records/search?q=&exclude=
	 *
	 * What RelateAutocomplete.jsx (the admin app's search-as-you-type
	 * control for a Relate to One/Relate to Many field) calls as a
	 * visitor types -- searches $class's own records by whichever field
	 * resolve_display_field() picks for it (the same field a Relate
	 * field's own already-selected value is *labeled* with, so "what you
	 * can find" and "what you see once you've picked it" are always the
	 * same field), and returns just enough to render an option list:
	 * `{id, label}`, never full record data.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function search_records( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$query_text     = trim( (string) $request->get_param( 'q' ) );
		$display_field  = self::resolve_display_field( $class );
		$exclude_ids    = array_filter( array_map( 'absint', explode( ',', (string) $request->get_param( 'exclude' ) ) ) );

		try {
			$builder = $class::query();

			if ( $exclude_ids ) {
				$builder->whereNotIn( 'id', $exclude_ids );
			}

			if ( '' !== $query_text ) {
				if ( $display_field ) {
					// Wildcards already present in the visitor's own typed
					// text are escaped first so they're matched literally,
					// not treated as LIKE wildcards themselves -- the same
					// reasoning (if not the same escaping mechanics --
					// Eloquent's query builder always parameter-binds this
					// value, so there's no SQL-injection concern here the
					// way $wpdb->esc_like() guards against) Facet_Query::
					// apply_collection_facets() already documents for its
					// own LIKE branch.
					$escaped = str_replace( array( '\\', '%', '_' ), array( '\\\\', '\\%', '\\_' ), $query_text );
					$builder->where( $display_field, 'LIKE', '%' . $escaped . '%' );
				} elseif ( ctype_digit( $query_text ) ) {
					// No text-ish field to search by name at all -- an
					// id lookup is still a coherent search, better than
					// refusing to filter at all.
					$builder->where( 'id', (int) $query_text );
				}
			}

			$records = $builder->orderBy( 'id', 'desc' )->limit( self::SEARCH_LIMIT )->get();
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_records_query_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			$records->map(
				function ( $record ) use ( $display_field ) {
					return self::record_option( $record, $display_field );
				}
			)->values()->all()
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function create_record( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$raw_body = (array) $request->get_json_params();
		$data     = Model_Fields::sanitize_record_data( $class, $raw_body );

		// Computed before every other validate_*() call, same reasoning
		// as those -- a freshly-computed slug (or a rejected Manual-mode
		// collision) needs to already be settled before
		// validate_required_fields() etc. ever look at $data.
		$permalink_result = self::resolve_permalink_value( $class, $data, $raw_body );

		if ( is_wp_error( $permalink_result ) ) {
			return $permalink_result;
		}

		// Checked BEFORE extract_relate_many_data() strips a Relate to
		// Many field's own value back out of $data -- see
		// Model_Fields::validate_required_fields()'s own docblock for why
		// the order here matters.
		$required_check = Model_Fields::validate_required_fields( $class, $data, true );

		if ( is_wp_error( $required_check ) ) {
			return $required_check;
		}

		$character_limit_check = Model_Fields::validate_character_limits( $class, $data );

		if ( is_wp_error( $character_limit_check ) ) {
			return $character_limit_check;
		}

		$range_check = Model_Fields::validate_range_values( $class, $data );

		if ( is_wp_error( $range_check ) ) {
			return $range_check;
		}

		$attachment_check = Model_Fields::validate_attachment_constraints( $class, $data );

		if ( is_wp_error( $attachment_check ) ) {
			return $attachment_check;
		}

		$relate_many = Model_Fields::extract_relate_many_data( $class, $data );

		try {
			$record = $class::create( $data );
			self::sync_relate_many( $record, $relate_many );
			self::set_permalink_manual_flag( $record, $class, $permalink_result['manual'] );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_record_create_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( self::enrich_record( $class, $record->fresh() ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_record( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$record = self::find_record( $class, $request->get_param( 'id' ) );

		if ( is_wp_error( $record ) ) {
			return $record;
		}

		return rest_ensure_response( self::enrich_record( $class, $record ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function update_record( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$record = self::find_record( $class, $request->get_param( 'id' ) );

		if ( is_wp_error( $record ) ) {
			return $record;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$raw_body = (array) $request->get_json_params();
		$data     = Model_Fields::sanitize_record_data( $class, $raw_body );

		// Same "before every other validate_*() call" reasoning as
		// create_record()'s own identical call -- $record is passed
		// through so Auto mode can read the source field's own EXISTING
		// value when this request doesn't touch it, Manual mode's own
		// collision check can exclude this record's own id, and an
		// omitted {name}__manual key preserves whatever mode the record
		// is already in.
		$permalink_result = self::resolve_permalink_value( $class, $data, $raw_body, $record );

		if ( is_wp_error( $permalink_result ) ) {
			return $permalink_result;
		}

		// What this record will actually look like once $data's own
		// changes are applied -- the record's own current attributes,
		// with $data's own (possibly partial) changes layered on top --
		// used ONLY to evaluate a field's own Conditional Logic against
		// (never to decide whether a required/character-limited value
		// itself is missing/too long -- that's still $data alone). A
		// partial update that never touches the field a rule references
		// still evaluates against that field's real, already-stored
		// value this way, rather than being unable to evaluate the rule
		// at all -- see Model_Fields::validate_required_fields()'s own
		// docblock.
		$effective_data = array_merge( $record->toArray(), $data );

		// $is_create = false: a required field this request simply
		// doesn't mention is left alone, not rejected -- only a required
		// field explicitly present-but-empty in this request is.
		$required_check = Model_Fields::validate_required_fields( $class, $data, false, $effective_data );

		if ( is_wp_error( $required_check ) ) {
			return $required_check;
		}

		$character_limit_check = Model_Fields::validate_character_limits( $class, $data, $effective_data );

		if ( is_wp_error( $character_limit_check ) ) {
			return $character_limit_check;
		}

		$range_check = Model_Fields::validate_range_values( $class, $data, $effective_data );

		if ( is_wp_error( $range_check ) ) {
			return $range_check;
		}

		$attachment_check = Model_Fields::validate_attachment_constraints( $class, $data, $effective_data );

		if ( is_wp_error( $attachment_check ) ) {
			return $attachment_check;
		}

		$relate_many = Model_Fields::extract_relate_many_data( $class, $data );

		try {
			$record->update( $data );
			self::sync_relate_many( $record, $relate_many );
			self::set_permalink_manual_flag( $record, $class, $permalink_result['manual'] );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_record_update_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( self::enrich_record( $class, $record->fresh() ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function delete_record( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$record = self::find_record( $class, $request->get_param( 'id' ) );

		if ( is_wp_error( $record ) ) {
			return $record;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		try {
			$record->delete();
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_record_delete_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * GET /gateway/v1/models/<class>/records/<id>/relationships/<method>?per_page=
	 *
	 * A record's own related items through one of its `hasMany`/
	 * `belongsToMany` relationships -- what `gateway/related-items`' own
	 * editor preview calls to show a real, page-1-sized sample of related
	 * records for whichever record is currently active in the parent
	 * `gateway/data-cards-body` preview, the same "real editor preview,
	 * not a placeholder" convention every other Collection-aware block
	 * in this plugin already follows. The real front end never calls
	 * this at all -- `gateway/related-items/render.php` resolves a
	 * record's own related items directly off the real Eloquent record
	 * already in block context, with no REST round trip.
	 *
	 * Only a `hasMany`/`belongsToMany` relationship is ever a sensible
	 * thing to "loop over" -- a `hasOne`/`belongsTo` has at most one
	 * related record, which is exactly what a Related Field
	 * (`Column_Registry::get_related_columns_for_collection()`) already
	 * surfaces as a plain value, not a repeated list.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_related_records( \WP_REST_Request $request ) {
		$class = self::require_model( $request->get_param( 'class' ) );

		if ( is_wp_error( $class ) ) {
			return $class;
		}

		$record = self::find_record( $class, $request->get_param( 'id' ) );

		if ( is_wp_error( $record ) ) {
			return $record;
		}

		$method       = (string) $request->get_param( 'method' );
		$relationship = Model_Relationships::find( $class, $method );

		if ( ! $relationship || ! in_array( $relationship['type'], array( 'hasMany', 'belongsToMany' ), true ) ) {
			return new \WP_Error(
				'gateway_relationship_not_loopable',
				__( 'This relationship isn\'t a "to many" relationship -- there\'s nothing to loop over.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		$per_page = (int) $request->get_param( 'per_page' );
		$per_page = $per_page > 0 ? min( self::MAX_PER_PAGE, $per_page ) : self::DEFAULT_PER_PAGE;

		try {
			$query   = $record->{ $method }();
			$total   = $query->count();
			$related = ( clone $query )->take( $per_page )->get();
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_records_query_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'records' => self::enrich_records( $relationship['related_model'], $related ),
				'total'   => $total,
			)
		);
	}

	/**
	 * @param string $class Model class name.
	 * @return string|\WP_Error The class name itself (for chaining) if
	 *              it's a real, registered model.
	 */
	private static function require_model( $class ) {
		if ( ! Model_Registry::has( $class ) || ! class_exists( $class ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return $class;
	}

	/**
	 * @param string $class Model class name.
	 * @param mixed  $id    Raw id route param.
	 * @return \Illuminate\Database\Eloquent\Model|\WP_Error
	 */
	private static function find_record( $class, $id ) {
		try {
			$record = $class::find( (int) $id );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_records_query_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		if ( ! $record ) {
			return new \WP_Error(
				'gateway_record_not_found',
				__( 'Record not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return $record;
	}

	/**
	 * Applies a Relate to Many field's own submitted value(s) via the
	 * relationship's real `sync()` -- there's no column these ever get
	 * written to via the record's own create()/update() call (see
	 * Model_Fields::extract_relate_many_data()'s own docblock for why),
	 * so this is the actual save step for that data, run once the record
	 * itself already exists (a brand new record needs its own id before
	 * a pivot row referencing it can exist at all).
	 *
	 * `sync()` -- not `attach()` -- replaces the full set of related
	 * records with exactly what was submitted, so removing a previously
	 * -selected record (per this feature's own request, "the user must
	 * be able to remove the selected related record") is just submitting
	 * the value without it, the same as every other field.
	 *
	 * @param \Illuminate\Database\Eloquent\Model $record      The just-saved record.
	 * @param array<string,int[]>                  $relate_many Map of relationship method_name => ids (Model_Fields::extract_relate_many_data()'s own shape).
	 */
	private static function sync_relate_many( \Illuminate\Database\Eloquent\Model $record, array $relate_many ) {
		foreach ( $relate_many as $method_name => $ids ) {
			$record->{$method_name}()->sync( array_map( 'absint', $ids ) );
		}
	}

	/**
	 * Computes this model's own Permalink field's real, unique slug value
	 * for one create()/update() call, and reports which mode (Auto/
	 * Manual) that computation ran in -- called right after
	 * `Model_Fields::sanitize_record_data()`, before any of the other
	 * `validate_*()` checks, so a freshly-computed slug is already
	 * present in `$data` by the time those run (in particular,
	 * `validate_required_fields()` sees a genuinely missing key, not a
	 * stale/blank one, when nothing could be resolved).
	 *
	 * A no-op (`{manual: false}`) if this model has no Permalink field at
	 * all -- `$data` is left completely untouched either way.
	 *
	 * **Mode resolution**: the request's own `{name}__manual` key wins if
	 * present (a real, explicit choice this save is making); otherwise
	 * an UPDATE preserves whatever mode the record is already in (its
	 * own current `{name}__manual` column), and a CREATE defaults to
	 * Auto. This is what makes an update that never touches the
	 * Permalink field at all (most updates, most of the time) leave its
	 * mode -- and therefore its slug -- exactly as it already was.
	 *
	 * **Manual mode**: whatever `$data` currently holds for this field is
	 * taken as the site owner's own literal intent -- `sanitize_title()`'d
	 * for URL-safety only, never silently rewritten further. A real
	 * collision against another record of the same model is rejected
	 * outright (`WP_Error`, 409) rather than mutated -- the site owner
	 * typed this on purpose. Nothing submitted (the key absent, or blank
	 * after trimming) leaves `$data` with no key for this field at all --
	 * on create, `validate_required_fields()` reports the normal "missing
	 * required field" if it's required; on update, the record's own
	 * existing value is simply left alone.
	 *
	 * **Auto mode**: slugified from the field's own configured
	 * `source_field` -- read from `$data` if THIS request touches it,
	 * else from the record's own current value on an update. Made unique
	 * by appending `-2`, `-3`, ... against a real collision check
	 * (mirrors WordPress core's own `wp_unique_post_slug()`), excluding
	 * this same record on an update so re-saving with an unchanged
	 * source value never needlessly appends a suffix to itself. No
	 * `source_field` configured, or nothing to slugify from yet (a brand
	 * new record whose source field is also blank this same request),
	 * behaves exactly like Manual mode's own "nothing submitted" case --
	 * left unset, never a fabricated empty slug.
	 *
	 * @param string $class_name Model class name.
	 * @param array  $data       `Model_Fields::sanitize_record_data()`'s
	 *                             own output, modified in place.
	 * @param array  $raw_body   The request's own full, raw JSON body --
	 *                             needed for `{name}__manual`, which
	 *                             `sanitize_record_data()` never carries
	 *                             through (it isn't a real field).
	 * @param \Illuminate\Database\Eloquent\Model|null $record The
	 *                             existing record being updated, or
	 *                             `null` on create.
	 * @return array{manual:bool}|\WP_Error
	 */
	private static function resolve_permalink_value( $class_name, array &$data, array $raw_body, $record = null ) {
		$field = Model_Fields::permalink_field_for( $class_name );

		if ( ! $field ) {
			return array( 'manual' => false );
		}

		$name       = $field['name'];
		$manual_key = "{$name}__manual";

		if ( array_key_exists( $manual_key, $raw_body ) ) {
			$manual = filter_var( $raw_body[ $manual_key ], FILTER_VALIDATE_BOOLEAN );
		} elseif ( $record ) {
			$manual = (bool) $record->getAttribute( $manual_key );
		} else {
			$manual = false;
		}

		if ( $manual ) {
			if ( ! array_key_exists( $name, $data ) || '' === trim( (string) $data[ $name ] ) ) {
				unset( $data[ $name ] );
				return array( 'manual' => true );
			}

			$slug = sanitize_title( trim( (string) $data[ $name ] ) );

			if ( self::permalink_slug_exists( $class_name, $name, $slug, $record ) ) {
				return new \WP_Error(
					'gateway_permalink_slug_taken',
					__( 'This permalink is already in use -- choose a different one.', 'gateway' ),
					array( 'status' => 409 )
				);
			}

			$data[ $name ] = $slug;

			return array( 'manual' => true );
		}

		$source_field = $field['settings']['source_field'] ?? '';
		$source_value = null;

		if ( '' !== $source_field ) {
			if ( array_key_exists( $source_field, $data ) ) {
				$source_value = $data[ $source_field ];
			} elseif ( $record ) {
				$source_value = $record->getAttribute( $source_field );
			}
		}

		if ( null === $source_value || '' === trim( (string) $source_value ) ) {
			unset( $data[ $name ] );

			return array( 'manual' => false );
		}

		$base_slug = sanitize_title( trim( (string) $source_value ) );
		$slug      = $base_slug;
		$suffix    = 2;

		while ( self::permalink_slug_exists( $class_name, $name, $slug, $record ) ) {
			$slug = "{$base_slug}-{$suffix}";
			++$suffix;
		}

		$data[ $name ] = $slug;

		return array( 'manual' => false );
	}

	/**
	 * @param string                                     $class_name Model class name.
	 * @param string                                     $field_name Permalink field's own column name.
	 * @param string                                     $slug       Candidate slug value.
	 * @param \Illuminate\Database\Eloquent\Model|null $exclude    The record currently being updated (excluded from
	 *                                                                the collision check by its own id) -- `null` on create,
	 *                                                                where every existing record is a real potential collision.
	 * @return bool
	 */
	private static function permalink_slug_exists( $class_name, $field_name, $slug, $exclude = null ) {
		$query = $class_name::where( $field_name, $slug );

		if ( $exclude ) {
			$query->where( 'id', '!=', $exclude->id );
		}

		return $query->exists();
	}

	/**
	 * Records which mode (Auto/Manual) a just-saved record's own
	 * Permalink field ended up in -- `resolve_permalink_value()`'s own
	 * companion write, called once the record itself has actually been
	 * created/updated successfully. Writes directly via `setAttribute()`
	 * + `save()`, deliberately bypassing mass assignment (`fill()`/the
	 * `create()`/`update()` call that just ran) entirely -- `{name}__manual`
	 * is Gateway-internal bookkeeping, never a real, user-fillable field,
	 * so it's never added to the generated model's own `$fillable` at
	 * all (see `Model_Builder`'s own docblock for that list); this is
	 * what keeps this whole feature from needing any change there.
	 *
	 * A no-op if this model has no Permalink field.
	 *
	 * @param \Illuminate\Database\Eloquent\Model $record     The just-saved record.
	 * @param string                                $class_name Model class name.
	 * @param bool                                  $manual     `resolve_permalink_value()`'s own returned mode.
	 */
	private static function set_permalink_manual_flag( \Illuminate\Database\Eloquent\Model $record, $class_name, $manual ) {
		$field = Model_Fields::permalink_field_for( $class_name );

		if ( ! $field ) {
			return;
		}

		$record->setAttribute( "{$field['name']}__manual", (bool) $manual );
		$record->save();
	}

	/**
	 * The one field resolve_display_field() (and therefore search_records()/
	 * enrich_records()) call would consider showing a related record's
	 * *label* as, if this model has one at all: the first field whose own
	 * type is genuinely free text and never sensitive -- a Password
	 * field's value must never be shown as another record's own label
	 * (Field_Type::is_sensitive()), and a Number/Range/Relate field
	 * itself isn't a meaningful "name" for a record the way a Text/
	 * TextArea/Email/URL field's value is.
	 */
	const DISPLAY_FIELD_TYPES = array( 'text', 'textarea', 'email', 'url' );

	/**
	 * Public (not just this controller's own concern any more): `gateway/
	 * data-display/render.php` calls this directly to label a sidebar
	 * item -- a parent group heading, or a child link -- the exact same
	 * way this controller already labels a related record's own option.
	 * One definition of "what a record's own display name is," reused
	 * everywhere that needs one instead of a second copy.
	 *
	 * @param string $class_name Model class name.
	 * @return string|null The field name to use as this model's own
	 *                       records' display label, or null if it has no
	 *                       suitable field (falls back to "#<id>" wherever
	 *                       this matters).
	 */
	public static function resolve_display_field( $class_name ) {
		foreach ( Model_Fields::all( $class_name ) as $field ) {
			if ( in_array( $field['type'], self::DISPLAY_FIELD_TYPES, true ) ) {
				return $field['name'];
			}
		}

		return null;
	}

	/**
	 * @param \Illuminate\Database\Eloquent\Model $record        A record of any model.
	 * @param string|null                          $display_field resolve_display_field()'s own result for that model.
	 * @return array{id:int,label:string}
	 */
	public static function record_option( \Illuminate\Database\Eloquent\Model $record, $display_field ) {
		$label = $display_field ? (string) ( $record->{$display_field} ?? '' ) : '';

		return array(
			'id'    => (int) $record->id,
			'label' => '' !== $label ? $label : ( '#' . $record->id ),
		);
	}

	/**
	 * @param string                                $class_name Model class name.
	 * @param \Illuminate\Database\Eloquent\Model $record     A single record.
	 * @return array Record data, with every Relate to One/Relate to Many
	 *                field's own raw value replaced by a richer shape --
	 *                see enrich_records()'s own docblock.
	 */
	private static function enrich_record( $class_name, \Illuminate\Database\Eloquent\Model $record ) {
		// Not the plain collect() helper -- that always returns a base
		// Illuminate\Support\Collection, which has no load() method at
		// all (that's Eloquent\Collection-specific); enrich_records()
		// needs the real thing to batch-eager-load every relate field's
		// relationship the same way it does for a genuine query result.
		$records = new \Illuminate\Database\Eloquent\Collection( array( $record ) );

		return self::enrich_records( $class_name, $records )[0];
	}

	/**
	 * Replaces every Relate to One/Relate to Many field's own raw stored
	 * value (a bare FK id, or -- for Relate to Many -- nothing at all,
	 * since there's no column) with a shape the admin app's RecordForm/
	 * RecordsCrud can render directly, without a second round trip per
	 * field per row: `{id, label}` for Relate to One (`null` if unset),
	 * `[{id, label}, ...]` for Relate to Many (`[]` if none selected).
	 * `label` is that related record's own resolve_display_field() value
	 * -- the exact same field search_records() searches by, so what a
	 * visitor finds while typing and what they see once it's selected are
	 * always the same field.
	 *
	 * Also flattens every Related Field (`Column_Registry::
	 * get_related_columns_for_collection()` -- a hasOne/belongsTo
	 * relationship's own related-model field, e.g. `Event belongsTo`
	 * gives a `Ticket` record an `"event.title"` key) onto the record
	 * under that exact same dotted key, resolved via `Column_Registry::
	 * resolve_collection_value()`. This is what makes `gateway/card-field-text`'s
	 * own *editor* preview (`record[fieldKey]`, in its `edit.js`) show
	 * the real related value instead of always falling back to the
	 * field's label for one of these -- the REST response this admin-app
	 * fetch (and `RecordsCrud`'s own table) reads previously had no key
	 * by that name at all, so `Object.prototype.hasOwnProperty.call(
	 * record, fieldKey )` was always `false` for a related field, no
	 * matter what. The real front end (`gateway/card-field-text/render.php`)
	 * was never affected by this -- it resolves a Related Field's value
	 * directly off the actual Eloquent record injected into block context,
	 * not through this REST response at all.
	 *
	 * Every relate field's own relationship AND every Related Field's own
	 * relationship are eager-loaded together via one `Collection::load()`
	 * call up front (one query per distinct *relationship*, not per
	 * record or per field -- Eloquent's own lazy-eager-loading, batched
	 * regardless of how many records are in $records) rather than
	 * resolving each record's own relation lazily one at a time, so this
	 * stays cheap for the Records list view (many rows), not just a
	 * single record.
	 *
	 * Also adds a `label` key to every record -- the exact same display
	 * value `record_option()`/`search_records()` already compute for a
	 * *related* record, now on the record's own top-level response too,
	 * so a caller needing a human label to show alongside (not instead
	 * of) the full record -- `gateway/data-display`'s own sidebar
	 * headings/child links, currently the only one -- never has to
	 * re-derive `resolve_display_field()`'s own "first genuinely
	 * free-text field" rule a second time, client-side, where none of
	 * this method's own field-type information is actually available.
	 *
	 * @param string                                     $class_name Model class name.
	 * @param \Illuminate\Database\Eloquent\Collection $records    Records of $class_name.
	 * @return array[] Each record's own toArray(), enriched.
	 */
	private static function enrich_records( $class_name, \Illuminate\Database\Eloquent\Collection $records ) {
		$relate_fields = array();
		$image_fields  = array();
		$file_fields   = array();
		$user_fields   = array();

		foreach ( Model_Fields::all( $class_name ) as $field ) {
			if ( null !== $field['relationship_method'] ) {
				$relate_fields[] = $field;
			}

			$type_class = Field_Type_Registry::get( $field['type'] );

			if ( $type_class && $type_class::supports_media_settings() ) {
				$image_fields[] = $field;
			}

			if ( $type_class && $type_class::supports_file_settings() ) {
				$file_fields[] = $field;
			}

			if ( $type_class && $type_class::supports_user_settings() ) {
				$user_fields[] = $field;
			}
		}

		// At most one -- Field_Type::max_one_per_model() is what
		// Model_Fields::add()/update() enforce that with -- so this is a
		// single field, not another array like the others above.
		$permalink_field = Model_Fields::permalink_field_for( $class_name );

		$related_columns = Column_Registry::get_related_columns_for_collection( $class_name );
		$display_field   = self::resolve_display_field( $class_name );

		if ( ( empty( $relate_fields ) && empty( $related_columns ) && empty( $image_fields ) && empty( $file_fields ) && empty( $user_fields ) ) || $records->isEmpty() ) {
			return $records->map(
				function ( $record ) use ( $display_field, $image_fields, $file_fields, $user_fields, $permalink_field ) {
					$array = $record->toArray();

					// Never overwrite a real field a site owner happens to
					// have named "label" -- "label" isn't one of
					// Model_Fields::RESERVED_NAMES, so this genuinely can
					// happen; the synthetic display label only fills in
					// where there's no naming conflict.
					if ( ! array_key_exists( 'label', $array ) ) {
						$array['label'] = self::record_option( $record, $display_field )['label'];
					}

					self::enrich_image_fields( $array, $image_fields );
					self::enrich_file_fields( $array, $file_fields );
					self::enrich_user_fields( $array, $user_fields );
					self::normalize_permalink_manual_flag( $array, $permalink_field );

					return $array;
				}
			)->values()->all();
		}

		$records->load(
			array_values(
				array_unique(
					array_merge(
						wp_list_pluck( $relate_fields, 'relationship_method' ),
						wp_list_pluck( $related_columns, 'relationship_method' )
					)
				)
			)
		);

		// Cached per related model class -- several Relate fields could
		// point at the same related model (or the same field could, across
		// many rows), and this never changes per class within one request.
		$display_fields_by_class = array();

		return $records->map(
			function ( $record ) use ( $relate_fields, $related_columns, $image_fields, $file_fields, $user_fields, $permalink_field, $display_field, &$display_fields_by_class ) {
				$array = $record->toArray();

				// Never overwrite a real field a site owner happens to
				// have named "label" -- see the early-return branch
				// above's own identical guard for why.
				if ( ! array_key_exists( 'label', $array ) ) {
					$array['label'] = self::record_option( $record, $display_field )['label'];
				}

				foreach ( $relate_fields as $field ) {
					$related_class = $field['related_model'];

					if ( $related_class && ! array_key_exists( $related_class, $display_fields_by_class ) ) {
						$display_fields_by_class[ $related_class ] = self::resolve_display_field( $related_class );
					}

					$display_field = $related_class ? $display_fields_by_class[ $related_class ] : null;
					$relation      = $record->{ $field['relationship_method'] };

					if ( $relation instanceof \Illuminate\Database\Eloquent\Model ) {
						$array[ $field['name'] ] = self::record_option( $relation, $display_field );
					} elseif ( $relation instanceof \Illuminate\Support\Collection ) {
						$array[ $field['name'] ] = $relation->map(
							function ( $related ) use ( $display_field ) {
								return self::record_option( $related, $display_field );
							}
						)->values()->all();
					} else {
						// Relate to One with nothing selected -- Relate to
						// Many's own "nothing selected" case already took
						// the Collection branch above (an empty Collection,
						// not null).
						$array[ $field['name'] ] = null;
					}
				}

				foreach ( $related_columns as $related_column ) {
					$array[ $related_column['key'] ] = Column_Registry::resolve_collection_value( $record, $related_column['key'] );
				}

				self::enrich_image_fields( $array, $image_fields );
				self::enrich_file_fields( $array, $file_fields );
				self::enrich_user_fields( $array, $user_fields );
				self::normalize_permalink_manual_flag( $array, $permalink_field );

				return $array;
			}
		)->values()->all();
	}

	/**
	 * Normalizes a Permalink field's own companion `{name}__manual`
	 * column to a real bool in the REST response -- unlike
	 * `enrich_image_fields()`/`enrich_file_fields()`/`enrich_user_fields()`,
	 * there's no shape to RESOLVE here (Eloquent's own `toArray()`
	 * already includes the raw column -- it's a real DB column, and
	 * `getFillable()` only restricts WRITES, not reads -- so this is
	 * purely a type-normalization pass), and a no-op entirely if this
	 * model has no Permalink field at all.
	 *
	 * @param array $array           A record's own toArray(), modified in place.
	 * @param array|null $permalink_field This model's own Permalink field
	 *                             (`Model_Fields::permalink_field_for()`'s
	 *                             own return value), or `null`.
	 */
	private static function normalize_permalink_manual_flag( array &$array, $permalink_field ) {
		if ( ! $permalink_field ) {
			return;
		}

		$manual_key = "{$permalink_field['name']}__manual";

		if ( array_key_exists( $manual_key, $array ) ) {
			$array[ $manual_key ] = (bool) $array[ $manual_key ];
		}
	}

	/**
	 * Replaces every Image field's own raw stored attachment id (in
	 * $array, by reference) with the shape its own `return_format`
	 * setting (`Field_Type::supports_media_settings()`) actually asks
	 * for -- `'id'` leaves the raw id alone, `'url'` becomes the
	 * attachment's own full-size URL, and `'array'` (the default,
	 * including when unset/invalid) becomes ACF's own familiar
	 * `{id, url, alt, width, height, sizes: {name: {url,width,height}, ...}}`
	 * shape -- `sizes` covering every size WordPress actually generated
	 * for this attachment (`wp_get_attachment_image_src()` per registered
	 * size, skipping one that comes back `false`) plus `full` for the
	 * original. `null` (nothing selected, or the id no longer names a
	 * real attachment) short-circuits to `null` regardless of format --
	 * there's no meaningful "empty image" shape to build for any of the
	 * three.
	 *
	 * `RecordForm`'s own edit UI reads this same enriched value
	 * regardless of the field's configured `return_format` -- see that
	 * component's own docblock for how it copes with all three shapes
	 * needing to work as an editing preview, not just as this record's
	 * own public API response.
	 *
	 * @param array $array        A record's own toArray(), modified in place.
	 * @param array $image_fields Every field on this model with
	 *                             `supports_media_settings()` true (this
	 *                             method's own caller already resolved
	 *                             this once per `enrich_records()` call,
	 *                             not per record).
	 */
	private static function enrich_image_fields( array &$array, array $image_fields ) {
		foreach ( $image_fields as $field ) {
			if ( ! array_key_exists( $field['name'], $array ) ) {
				continue;
			}

			$attachment_id = $array[ $field['name'] ];

			if ( empty( $attachment_id ) || ! is_numeric( $attachment_id ) ) {
				$array[ $field['name'] ] = null;
				continue;
			}

			$attachment_id  = (int) $attachment_id;
			$return_format  = $field['settings']['return_format'] ?? 'array';
			$array[ $field['name'] ] = self::resolve_image_value( $attachment_id, $return_format );
		}
	}

	/**
	 * Public (unlike this class's every other helper) specifically so
	 * `Media_REST_Controller::get_media()` can build the exact same
	 * enriched shape for its own `GET /gateway/v1/media/<id>` route --
	 * needed by `RecordForm`'s own Image picker whenever a field's
	 * `return_format` is `'id'` (the record's own value is then a bare
	 * integer with nothing else to build a preview from).
	 *
	 * @param int    $attachment_id WP attachment post id.
	 * @param string $return_format One of 'array'/'url'/'id'.
	 * @return array{id:int,url:?string,alt:string,width:?int,height:?int,sizes:array}|string|int|null
	 */
	public static function resolve_image_value( $attachment_id, $return_format ) {
		if ( ! function_exists( 'wp_get_attachment_url' ) || ! get_post( $attachment_id ) ) {
			// No real attachment behind this id any more (deleted by
			// hand, e.g.) -- same "don't invent data for something that
			// isn't there" reasoning a Relate field's own dangling id
			// gets, just resolved to `null` here since there's no
			// sensible partial shape to return instead.
			return null;
		}

		if ( 'id' === $return_format ) {
			return $attachment_id;
		}

		$url = wp_get_attachment_url( $attachment_id );

		if ( 'url' === $return_format ) {
			return $url;
		}

		$metadata = wp_get_attachment_metadata( $attachment_id );
		$sizes    = array(
			'full' => array(
				'url'    => $url,
				'width'  => isset( $metadata['width'] ) ? (int) $metadata['width'] : null,
				'height' => isset( $metadata['height'] ) ? (int) $metadata['height'] : null,
			),
		);

		foreach ( array_keys( wp_get_registered_image_subsizes() ) as $size_name ) {
			$src = wp_get_attachment_image_src( $attachment_id, $size_name );

			if ( is_array( $src ) ) {
				$sizes[ $size_name ] = array(
					'url'    => $src[0],
					'width'  => (int) $src[1],
					'height' => (int) $src[2],
				);
			}
		}

		return array(
			'id'     => $attachment_id,
			'url'    => $url,
			'alt'    => get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
			'width'  => $sizes['full']['width'],
			'height' => $sizes['full']['height'],
			'sizes'  => $sizes,
		);
	}

	/**
	 * File_Field_Type's own close sibling of enrich_image_fields() above --
	 * same "replace the raw stored id with whatever return_format asks
	 * for" shape, just via resolve_file_value() instead.
	 *
	 * @param array $array       A record's own toArray(), modified in place.
	 * @param array $file_fields Every field on this model with
	 *                            `supports_file_settings()` true (this
	 *                            method's own caller already resolved
	 *                            this once per `enrich_records()` call,
	 *                            not per record).
	 */
	private static function enrich_file_fields( array &$array, array $file_fields ) {
		foreach ( $file_fields as $field ) {
			if ( ! array_key_exists( $field['name'], $array ) ) {
				continue;
			}

			$attachment_id = $array[ $field['name'] ];

			if ( empty( $attachment_id ) || ! is_numeric( $attachment_id ) ) {
				$array[ $field['name'] ] = null;
				continue;
			}

			$attachment_id           = (int) $attachment_id;
			$return_format           = $field['settings']['return_format'] ?? 'array';
			$array[ $field['name'] ] = self::resolve_file_value( $attachment_id, $return_format );
		}
	}

	/**
	 * File_Field_Type's own close sibling of resolve_image_value() above --
	 * same three-way `return_format` shape (bare id / plain URL / an
	 * enriched object), but built for a generic attachment rather than an
	 * image specifically: no width/height/sizes (meaningless for a PDF or
	 * a .zip), instead the handful of things actually useful about ANY
	 * file -- its filename, its title, its MIME type, and its size in
	 * bytes. Public for the same reason resolve_image_value() is:
	 * `Media_REST_Controller::get_media()`/`get_media_by_url()` build this
	 * exact shape for `FilePicker.jsx`'s own preview needs when a field's
	 * `return_format` is `'id'`/`'url'`.
	 *
	 * @param int    $attachment_id WP attachment post id.
	 * @param string $return_format One of 'array'/'url'/'id'.
	 * @return array{id:int,url:?string,filename:string,title:string,mime_type:string,filesize:?int}|string|int|null
	 */
	public static function resolve_file_value( $attachment_id, $return_format ) {
		if ( ! function_exists( 'wp_get_attachment_url' ) || ! get_post( $attachment_id ) ) {
			// No real attachment behind this id any more -- same
			// reasoning as resolve_image_value()'s own identical guard.
			return null;
		}

		if ( 'id' === $return_format ) {
			return $attachment_id;
		}

		$url = wp_get_attachment_url( $attachment_id );

		if ( 'url' === $return_format ) {
			return $url;
		}

		$file_path = get_attached_file( $attachment_id );

		return array(
			'id'        => $attachment_id,
			'url'       => $url,
			'filename'  => $file_path ? wp_basename( $file_path ) : '',
			'title'     => get_the_title( $attachment_id ),
			'mime_type' => get_post_mime_type( $attachment_id ),
			'filesize'  => ( $file_path && file_exists( $file_path ) ) ? filesize( $file_path ) : null,
		);
	}

	/**
	 * User_Field_Type's own close sibling of `enrich_image_fields()`/
	 * `enrich_file_fields()` above -- same "replace the raw stored id
	 * with whatever return_format asks for" shape, just via
	 * `resolve_user_value()` instead.
	 *
	 * @param array $array       A record's own toArray(), modified in place.
	 * @param array $user_fields Every field on this model with
	 *                            `supports_user_settings()` true (this
	 *                            method's own caller already resolved
	 *                            this once per `enrich_records()` call,
	 *                            not per record).
	 */
	private static function enrich_user_fields( array &$array, array $user_fields ) {
		foreach ( $user_fields as $field ) {
			if ( ! array_key_exists( $field['name'], $array ) ) {
				continue;
			}

			$user_id = $array[ $field['name'] ];

			if ( empty( $user_id ) || ! is_numeric( $user_id ) ) {
				$array[ $field['name'] ] = null;
				continue;
			}

			$user_id                 = (int) $user_id;
			$return_format           = $field['settings']['return_format'] ?? 'array';
			$array[ $field['name'] ] = self::resolve_user_value( $user_id, $return_format );
		}
	}

	/**
	 * User_Field_Type's own close sibling of `resolve_image_value()`/
	 * `resolve_file_value()` above -- but simpler, with only two
	 * `return_format` shapes (bare id / an enriched object), never a
	 * `'url'` one -- see `Field_Type::supports_user_settings()`'s own
	 * docblock for why. Public for the same reason those two are:
	 * `User_REST_Controller::get_user()` builds this exact shape for
	 * `UserPicker.jsx`'s own preview needs when a field's `return_format`
	 * is `'id'` (the record's own value is then a bare integer with
	 * nothing else to build a preview from).
	 *
	 * @param int    $user_id       WP user id.
	 * @param string $return_format One of 'array'/'id' (anything else,
	 *                                including missing/invalid, is
	 *                                treated as 'array' -- the same
	 *                                "invalid falls back to the rich
	 *                                shape, not an error" convention
	 *                                every other return_format already
	 *                                has).
	 * @return array{id:int,name:string,email:string,avatar_url:string}|int|null
	 */
	public static function resolve_user_value( $user_id, $return_format ) {
		$user = get_userdata( $user_id );

		if ( ! $user ) {
			// No real user behind this id any more (deleted by hand,
			// e.g.) -- same "don't invent data for something that isn't
			// there" reasoning a since-deleted attachment's own id
			// already gets from resolve_image_value()/resolve_file_value().
			return null;
		}

		if ( 'id' === $return_format ) {
			return $user_id;
		}

		return array(
			'id'         => $user_id,
			'name'       => $user->display_name,
			'email'      => $user->user_email,
			'avatar_url' => get_avatar_url( $user_id ),
		);
	}

	/**
	 * @return \WP_Error
	 */
	private static function unavailable_error() {
		return new \WP_Error(
			'gateway_database_unavailable',
			__( 'The database connection isn\'t currently working -- check the Database Connection screen before editing records.', 'gateway' ),
			array( 'status' => 503 )
		);
	}
}
