<?php
/**
 * REST API route exposing every registered field type -- what the admin
 * app's Field Editor and record CRUD forms build their type dropdown/
 * `<input>` rendering from, instead of keeping a second, hardcoded copy
 * of that list in JavaScript.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Field_Type_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/field-types
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/field-types',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_field_types' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);
	}

	/**
	 * Same gate as the rest of the Models/Fields admin API -- this isn't
	 * sensitive data, but it's only ever consumed by an admin-only screen.
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
	public static function list_field_types() {
		return rest_ensure_response( Field_Type_Registry::describe_all() );
	}
}
