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
	 * PUT    /gateway/v1/models/<class>/fields-order
	 *
	 * The URL segment is named `field_name`, not `name`, specifically so
	 * it never collides with the request body's own `name` param on the
	 * PUT route (the field's *current* name, from the URL, versus the
	 * *new* name being saved, from the body -- get_param() would return
	 * whichever one wins if both used the same key).
	 *
	 * `fields-order` is its own route, a sibling of `fields` rather than
	 * nested under it (e.g. not `/fields/order`) -- nesting it would put
	 * it in direct conflict with `/fields/(?P<field_name>...)` above,
	 * which would just as happily match the literal string "order" as a
	 * field name.
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

		register_rest_route(
			self::NAMESPACE_,
			'/models/(?P<class>[A-Za-z0-9_]+)/fields-order',
			array(
				array(
					'methods'             => \WP_REST_Server::EDITABLE,
					'callback'            => array( __CLASS__, 'reorder_fields' ),
					'permission_callback' => array( __CLASS__, 'permissions_check' ),
					'args'                => array(
						'order' => array(
							'required' => true,
							'type'     => 'array',
							'items'    => array( 'type' => 'string' ),
						),
					),
				),
			)
		);
	}

	/**
	 * @return array
	 */
	private static function field_args() {
		return array(
			'name'                 => array(
				// Not required: ignored entirely for a Relationship_Field_Type
				// ("Relate to One"/"Relate to Many") -- see Model_Fields::
				// add()'s own docblock for why there's nothing meaningful
				// to type in for one of those.
				'required' => false,
				'type'     => 'string',
				'default'  => '',
			),
			'type'                 => array(
				'required' => true,
				'type'     => 'string',
				'enum'     => Field_Type_Registry::keys(),
			),
			'label'                => array(
				'required' => false,
				'type'     => 'string',
				// Blank (the default) means "derive one from name" -- see
				// Model_Fields' own docblock.
			),
			'relationship_method'  => array(
				// Required only for a Relationship_Field_Type -- Model_Fields::
				// add() itself enforces that (this route accepts it
				// unconditionally so the same args shape works for every
				// field type without a per-type schema).
				'required' => false,
				'type'     => 'string',
			),
			'choices'              => array(
				// Required only for a Choice_Field_Type ("Buttons"/
				// "Select"/"Radio"/"Checkbox") -- Model_Fields::add()/
				// update() themselves enforce that (require_choices_for_field()),
				// same reasoning as relationship_method above. Ordered --
				// array element order is what the admin app's own
				// orderable choices list editor actually sends, and what
				// Model_Field_Choices::set() records as each choice's
				// own `position`.
				'required' => false,
				'type'     => 'array',
				'items'    => array( 'type' => 'string' ),
				'default'  => array(),
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
			$request->get_param( 'type' ),
			(string) $request->get_param( 'label' ),
			$request->get_param( 'relationship_method' ),
			$request->get_param( 'choices' )
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
			$request->get_param( 'type' ),
			(string) $request->get_param( 'label' ),
			$request->get_param( 'choices' )
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

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function reorder_fields( \WP_REST_Request $request ) {
		$result = Model_Fields::reorder(
			$request->get_param( 'class' ),
			(array) $request->get_param( 'order' )
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return rest_ensure_response( $result );
	}
}
