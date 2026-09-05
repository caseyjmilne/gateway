<?php
/**
 * REST API routes the admin app's Models screens use: the list + create
 * form, and the single-model detail view.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET   /gateway/v1/models
	 * POST  /gateway/v1/models
	 * GET   /gateway/v1/models/<class>
	 * PUT   /gateway/v1/models/<class>
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'list_models' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'create_model' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => self::create_args(),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_model' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'rename_model' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => self::title_args(),
				),
			)
		);
	}

	/**
	 * Shared 'args' schema for the two routes that accept a title --
	 * create_model() and rename_model() take the exact same fields.
	 *
	 * @return array
	 */
	private static function title_args() {
		return array(
			'title'        => array(
				'required' => true,
				'type'     => 'string',
			),
			'plural_title' => array(
				'required' => false,
				'type'     => 'string',
			),
		);
	}

	/**
	 * create_model()'s own 'args' -- title_args() plus 'type', which only
	 * ever applies at creation: Model_Builder::get_model_type()'s own
	 * docblock covers why there's no way to change it afterward, so
	 * rename_model() has no equivalent of this and keeps using
	 * title_args() alone -- a 'type' in that request body is simply
	 * never read.
	 *
	 * @return array
	 */
	private static function create_args() {
		return array_merge(
			self::title_args(),
			array(
				'type' => array(
					'required' => false,
					'type'     => 'string',
					'enum'     => array( Model_Builder::TYPE_CONTENT_TYPE, Model_Builder::TYPE_DATA_MODEL ),
					'default'  => Model_Builder::TYPE_DATA_MODEL,
				),
			)
		);
	}

	/**
	 * Managing models means creating database tables -- admin-only.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway models.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function list_models() {
		$models = array_map( array( __CLASS__, 'describe_model' ), Model_Registry::all() );

		return rest_ensure_response( array_values( array_filter( $models ) ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_model( \WP_REST_Request $request ) {
		$class = $request->get_param( 'class' );

		if ( ! Model_Registry::has( $class ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$model = self::describe_model( $class );

		if ( ! $model ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( $model );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function create_model( \WP_REST_Request $request ) {
		$result = Model_Builder::create(
			$request->get_param( 'title' ),
			(string) $request->get_param( 'plural_title' ),
			(string) $request->get_param( 'type' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( $result );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rename_model( \WP_REST_Request $request ) {
		$result = Model_Builder::rename(
			$request->get_param( 'class' ),
			$request->get_param( 'title' ),
			(string) $request->get_param( 'plural_title' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( $result );
	}

	/**
	 * Shape a registered model class into what the list, detail, and
	 * Records screens all need -- its table, its stored Plural Title
	 * label (if any), its Type (Model_Builder::get_model_type() -- fixed
	 * at creation, so the detail screen's General tab shows this as a
	 * plain static label, never an editable control), its fields
	 * (Gateway\Model_Fields -- the detail screen's Field Editor uses
	 * these as its initial list, avoiding a second request), its
	 * relationships (Gateway\Model_Relationships, same reasoning -- the
	 * detail screen's Relationship Editor's own initial list), its
	 * Records-table column configuration (Gateway\Model_Columns, same
	 * reasoning again -- the detail screen's new Columns tab's own
	 * initial list, and also what RecordsCrud.jsx itself reads to decide
	 * which columns to actually show), its row count (for the Records
	 * list screen), and its migration's version/run status (looked up
	 * via the same naming convention Model_Builder itself used to
	 * generate it, since that link isn't stored anywhere separately).
	 *
	 * @param string $class Registered model class name.
	 * @return array{class:string,slug:string,table:string,plural_title:string,type:string,fields:array,relationships:array,columns:?array,count:?int,migration:?array}|null
	 *              Null if $class is no longer a real, loaded class
	 *              (shouldn't normally happen, but registration and the
	 *              filesystem could in principle drift apart).
	 */
	private static function describe_model( $class ) {
		if ( ! class_exists( $class ) ) {
			return null;
		}

		$instance        = new $class();
		$table           = $instance->getTable();
		$migration_class = Model_Builder::migration_class_for_table( $table );
		$migration       = null;

		if ( Migration_Registry::has( $migration_class ) && class_exists( $migration_class ) ) {
			$migration_instance = new $migration_class();
			$version            = isset( $migration_instance->version ) ? $migration_instance->version : null;

			$migration = array(
				'class'   => $migration_class,
				'version' => $version,
				'has_run' => null !== $version ? Migration_Runner::has_run( $version ) : false,
			);
		}

		try {
			$count = $class::count();
		} catch ( \Throwable $e ) {
			// The table may not exist yet (migration never ran) or the
			// database may be unreachable right now -- either way, the
			// rest of this model's info is still worth returning; the
			// Records screen shows this as "--" rather than a number.
			$count = null;
		}

		return array(
			'class'         => $class,
			// The kebab-case URL slug the admin app's own router uses in
			// place of the raw class name (`#/models/doc`, not
			// `#/models/Doc`) -- always mechanically derived from `$class`
			// itself (Model_Builder::slug_for_class()'s own docblock), so
			// it's included here rather than stored anywhere: this stays
			// correct automatically even for a model registered before
			// this field ever existed.
			'slug'          => Model_Builder::slug_for_class( $class ),
			'table'         => $table,
			'plural_title'  => Model_Builder::get_plural_title( $class ),
			'type'          => Model_Builder::get_model_type( $class ),
			// for_rest_response() -- not the raw all() result -- casts
			// each field's own `settings` to a real JSON object, never a
			// bare (and, when empty, ambiguous) PHP array. See that
			// method's own docblock for the real bug this fixes.
			'fields'        => array_map(
				function ( $field ) {
					return Model_Fields::for_rest_response( $field );
				},
				Model_Fields::all( $class )
			),
			'relationships' => Model_Relationships::all( $class ),
			// Null means "never configured" -- see Model_Columns' own
			// docblock for why RecordsCrud.jsx (and this method's own
			// sibling GET routes) need to tell that apart from
			// "configured to show every current field."
			'columns'       => Model_Columns::get( $class ),
			'count'         => $count,
			'migration'     => $migration,
		);
	}
}
