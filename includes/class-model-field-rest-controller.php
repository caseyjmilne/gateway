<?php
/**
 * REST API routes for the admin app's Field Editor -- managing one
 * model's field definitions (Gateway\Model_Fields).
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Field_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET    /gateway/v1/models/<class>/fields
	 * POST   /gateway/v1/models/<class>/fields
	 * PUT    /gateway/v1/models/<class>/fields/<field_name>
	 * DELETE /gateway/v1/models/<class>/fields/<field_name>
	 *
	 * The URL segment is named `field_name`, not `name`, specifically so
	 * it never collides with the request body's own `name` param on the
	 * PUT route (the field's *current* name, from the URL, versus the
	 * *new* name being saved, from the body -- get_param() would return
	 * whichever one wins if both used the same key).
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/fields',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'list_fields' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'add_field' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => self::field_args(),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/fields/(?P<field_name>[A-Za-z0-9_]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'update_field' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => self::field_args(),
				),
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'remove_field' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
			)
		);
	}

	/**
	 * @return array
	 */
	private static function field_args() {
		return array(
			'name' => array(
				'required' => true,
				'type'     => 'string',
			),
			'type' => array(
				'required' => true,
				'type'     => 'string',
				'enum'     => array_keys( Model_Fields::BLUEPRINT_METHODS ),
			),
		);
	}

	/**
	 * Adding/editing/removing a field means altering a real database
	 * table -- admin-only.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway model fields.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function list_fields( \WP_REST_Request $request ) {
		return rest_ensure_response( Model_Fields::all( $request->get_param( 'class' ) ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function add_field( \WP_REST_Request $request ) {
		$result = Model_Fields::add(
			$request->get_param( 'class' ),
			$request->get_param( 'name' ),
			$request->get_param( 'type' )
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
	public static function update_field( \WP_REST_Request $request ) {
		$result = Model_Fields::update(
			$request->get_param( 'class' ),
			$request->get_param( 'field_name' ),
			$request->get_param( 'name' ),
			$request->get_param( 'type' )
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
	public static function remove_field( \WP_REST_Request $request ) {
		$result = Model_Fields::remove(
			$request->get_param( 'class' ),
			$request->get_param( 'field_name' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( array( 'deleted' => true ) );
	}
}
