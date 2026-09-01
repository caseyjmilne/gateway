<?php
/**
 * REST API route the block editor uses to detect whether a Collection
 * currently has a working Permalink -- gateway/card-link's own edit.js
 * is the only consumer, so it knows whether to warn ("no Permalink
 * available") or show its own live preview link.
 *
 * Deliberately its own tiny controller rather than folded into
 * Model_REST_Controller/Columns_REST_Controller: this is neither "manage
 * a model" (Model_REST_Controller, the admin app's own Models screen)
 * nor "list a model's available columns" (Columns_REST_Controller, a
 * flat array shape every existing consumer already depends on) -- a
 * clean, single-purpose route needs neither's own response shape.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Permalink_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/models/<class>/permalink
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/permalink',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_permalink_config' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);
	}

	/**
	 * A Collection is an admin-only concept throughout this plugin (every
	 * other Models/Fields/Relationships/Columns route gates on
	 * manage_options) -- same gate here; this is only ever read from
	 * inside the block editor by someone who could already configure a
	 * Collection-sourced block in the first place, same reasoning
	 * Columns_REST_Controller::collection_permissions_check() already
	 * gives for the identical gate.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to view this model\'s Permalink configuration.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_permalink_config( \WP_REST_Request $request ) {
		$class = $request->get_param( 'class' );

		if ( ! Model_Registry::has( $class ) || ! class_exists( $class ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$route = Permalink_Routes::route_for_class( $class );

		return rest_ensure_response(
			array(
				'available' => null !== $route,
				'field'     => $route['field'] ?? null,
				'root'      => $route['root'] ?? null,
			)
		);
	}
}
