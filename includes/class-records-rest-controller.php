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

		try {
			$total   = $class::count();
			$records = $class::orderBy( 'id', 'desc' )->forPage( $page, $per_page )->get();
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_records_query_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response(
			array(
				'records'  => self::enrich_records( $class, $records ),
				'total'    => $total,
				'page'     => $page,
				'per_page' => $per_page,
			)
		);
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

		$data = Model_Fields::sanitize_record_data( $class, (array) $request->get_json_params() );

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

		$relate_many = Model_Fields::extract_relate_many_data( $class, $data );

		try {
			$record = $class::create( $data );
			self::sync_relate_many( $record, $relate_many );
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

		$data = Model_Fields::sanitize_record_data( $class, (array) $request->get_json_params() );

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

		$relate_many = Model_Fields::extract_relate_many_data( $class, $data );

		try {
			$record->update( $data );
			self::sync_relate_many( $record, $relate_many );
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

		foreach ( Model_Fields::all( $class_name ) as $field ) {
			if ( null !== $field['relationship_method'] ) {
				$relate_fields[] = $field;
			}
		}

		$related_columns = Column_Registry::get_related_columns_for_collection( $class_name );
		$display_field   = self::resolve_display_field( $class_name );

		if ( ( empty( $relate_fields ) && empty( $related_columns ) ) || $records->isEmpty() ) {
			return $records->map(
				function ( $record ) use ( $display_field ) {
					$array = $record->toArray();

					// Never overwrite a real field a site owner happens to
					// have named "label" -- "label" isn't one of
					// Model_Fields::RESERVED_NAMES, so this genuinely can
					// happen; the synthetic display label only fills in
					// where there's no naming conflict.
					if ( ! array_key_exists( 'label', $array ) ) {
						$array['label'] = self::record_option( $record, $display_field )['label'];
					}

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
			function ( $record ) use ( $relate_fields, $related_columns, $display_field, &$display_fields_by_class ) {
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

				return $array;
			}
		)->values()->all();
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
