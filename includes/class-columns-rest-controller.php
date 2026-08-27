<?php
/**
 * REST API route the block editor's column picker uses to discover which
 * columns are available for a given post type (core fields + meta,
 * resolved via Column_Registry).
 *
 * Kept separate from the block/render code so future blocks -- or other
 * routes for column-related concerns -- have an obvious, dedicated home
 * (gateway/v1) to be added alongside this one.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Columns_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/columns/<post_type>
	 * GET /gateway/v1/columns-for-collection/<class>
	 *
	 * Two separate routes, not one with a type param, because they can't
	 * share a `sanitize_callback`: `sanitize_key()` (needed for a post
	 * type slug) lowercases everything, which would silently corrupt a
	 * model's real, case-sensitive class name (e.g. "BlogPost" ->
	 * "blogpost", not a real registered class) before it ever reached
	 * Column_Registry.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/columns/(?P<post_type>[a-zA-Z0-9_-]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_columns' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'post_type' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_key',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/columns-for-collection/(?P<class>[A-Za-z0-9_]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_columns_for_collection' ),
				'permission_callback' => array( __CLASS__, 'collection_permissions_check' ),
			)
		);
	}

	/**
	 * Only users who could actually edit this post type may see its
	 * available columns (meta keys can be sensitive-ish, and this is only
	 * ever consumed by the block editor).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return true|\WP_Error
	 */
	public static function permissions_check( \WP_REST_Request $request ) {
		$post_type_object = get_post_type_object( sanitize_key( $request->get_param( 'post_type' ) ) );

		if ( ! $post_type_object ) {
			return new \WP_Error(
				'gateway_invalid_post_type',
				__( 'Invalid post type.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$capability = ! empty( $post_type_object->cap->edit_posts ) ? $post_type_object->cap->edit_posts : 'edit_posts';

		if ( ! current_user_can( $capability ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to view columns for this post type.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_columns( \WP_REST_Request $request ) {
		$post_type = sanitize_key( $request->get_param( 'post_type' ) );

		if ( ! post_type_exists( $post_type ) ) {
			return new \WP_Error(
				'gateway_invalid_post_type',
				__( 'Invalid post type.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( Column_Registry::get_columns( $post_type ) );
	}

	/**
	 * Models are an admin-only concept throughout this plugin (every other
	 * Models/Fields/Relationships route gates on manage_options) -- same
	 * gate here, rather than the post-type route's own per-post-type
	 * edit_posts capability, which has no real model-specific equivalent.
	 *
	 * @return true|\WP_Error
	 */
	public static function collection_permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to view columns for this model.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_columns_for_collection( \WP_REST_Request $request ) {
		$class_name = $request->get_param( 'class' );

		if ( ! Model_Registry::has( $class_name ) || ! class_exists( $class_name ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( Column_Registry::get_columns_for_collection( $class_name ) );
	}
}
