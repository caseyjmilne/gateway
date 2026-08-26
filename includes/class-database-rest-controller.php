<?php
/**
 * REST API routes the Gateway admin screen's "Database" tab uses to read
 * the current PDO connection settings and to test (and, given a port,
 * persist) that connection -- see Database_Connection for the actual
 * connection logic.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Database_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET  /gateway/v1/database/config
	 * POST /gateway/v1/database/test
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/database/config',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_config' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/database/test',
			array(
				'methods'             => \WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'test_connection' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'port' => array(
						'required' => false,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * This is a database credentials screen -- only site administrators may
	 * view or change it.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage the Gateway database connection.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function get_config() {
		return rest_ensure_response( Database_Connection::public_config( Database_Connection::get_config() ) );
	}

	/**
	 * If a 'port' param is present, it's saved (or, if blank, clears the
	 * override) before testing -- so the admin screen's "Test Connection"
	 * button both persists and verifies a newly-entered port in one action.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function test_connection( \WP_REST_Request $request ) {
		$raw_port = $request->get_param( 'port' );

		if ( null !== $raw_port && ! Database_Connection::set_custom_port( $raw_port ) ) {
			return new \WP_Error(
				'gateway_invalid_port',
				__( 'Port must be a number between 1 and 65535, or blank to use the default.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		return rest_ensure_response( Database_Connection::test() );
	}
}
