<?php
/**
 * REST API routes for the admin app's Relationship Editor -- managing
 * one model's relationship definitions (Gateway\Model_Relationships).
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Relationship_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET    /gateway/v1/models/<class>/relationships
	 * POST   /gateway/v1/models/<class>/relationships
	 * DELETE /gateway/v1/models/<class>/relationships/<method_name>
	 * GET    /gateway/v1/relationship-types
	 *
	 * There's no PUT route here -- unlike fields, a relationship is only
	 * ever added or removed, never edited in place (see
	 * Model_Relationships' own docblock: everything about one, including
	 * its method name, is derived automatically from its related model +
	 * type, so "editing" it is really just removing one and adding a
	 * different one).
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/relationships',
			array(
				array(
					'methods'             => \WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'list_relationships' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
				array(
					'methods'             => \WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'add_relationship' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => array(
						'related_model' => array(
							'required' => true,
							'type'     => 'string',
						),
						'type'          => array(
							'required' => true,
							'type'     => 'string',
							'enum'     => array_keys( Model_Relationships::TYPES ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/relationships/(?P<method_name>[A-Za-z0-9_]+)',
			array(
				array(
					'methods'             => \WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'remove_relationship' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/relationship-types',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_relationship_types' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);
	}

	/**
	 * Adding/removing a relationship means rewriting a generated model
	 * file -- admin-only, same gate as the rest of the Models/Fields
	 * admin API.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway model relationships.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function list_relationships( \WP_REST_Request $request ) {
		return rest_ensure_response( Model_Relationships::all( $request->get_param( 'class' ) ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function add_relationship( \WP_REST_Request $request ) {
		$result = Model_Relationships::add(
			$request->get_param( 'class' ),
			$request->get_param( 'related_model' ),
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
	public static function remove_relationship( \WP_REST_Request $request ) {
		$result = Model_Relationships::remove(
			$request->get_param( 'class' ),
			$request->get_param( 'method_name' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function list_relationship_types() {
		return rest_ensure_response( Model_Relationships::describe_types() );
	}
}
