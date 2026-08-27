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
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET/POST      /gateway/v1/models/<class>/records
	 * GET/PUT/DELETE /gateway/v1/models/<class>/records/<id>
	 *
	 * Record create/update bodies are deliberately NOT given a fixed
	 * 'args' schema -- unlike every other route in this plugin, the set
	 * of valid keys here is dynamic (whatever Model_Fields::all()
	 * currently returns for this specific model), so it's read straight
	 * from the request body and filtered through
	 * Model_Fields::sanitize_record_data() inside the callback instead.
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
				'records'  => $records->values()->toArray(),
				'total'    => $total,
				'page'     => $page,
				'per_page' => $per_page,
			)
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

		try {
			$record = $class::create( $data );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_record_create_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( $record->toArray() );
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

		return rest_ensure_response( $record->toArray() );
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

		try {
			$record->update( $data );
		} catch ( \Throwable $e ) {
			return new \WP_Error( 'gateway_record_update_failed', $e->getMessage(), array( 'status' => 500 ) );
		}

		return rest_ensure_response( $record->fresh()->toArray() );
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
