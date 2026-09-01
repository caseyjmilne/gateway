<?php
/**
 * REST API route for the admin app's Columns tab -- managing one model's
 * Records-table column configuration (Gateway\Model_Columns).
 *
 * There's no GET route here: a model's current Columns config already
 * rides along in Model_REST_Controller::describe_model()'s own response
 * (the same request ModelDetail.jsx already makes for General/Fields/
 * Relationships/Permalinks), so a second round trip just for this would
 * be redundant.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Column_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * PUT /gateway/v1/models/<class>/columns
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/columns',
			array(
				'methods'             => \WP_REST_Server::EDITABLE,
				'callback'            => array( __CLASS__, 'set_columns' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'columns' => array(
						'required' => true,
						'type'     => 'array',
					),
				),
			)
		);
	}

	/**
	 * Same gate as the rest of the Models/Fields/Relationships admin API.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway model columns.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function set_columns( \WP_REST_Request $request ) {
		$class = $request->get_param( 'class' );

		if ( ! Model_Registry::has( $class ) || ! class_exists( $class ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$columns = (array) $request->get_param( 'columns' );

		return rest_ensure_response( Model_Columns::set( $class, $columns ) );
	}
}
