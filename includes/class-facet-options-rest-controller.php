<?php
/**
 * REST API routes the block editor's own facet blocks (gateway/facet,
 * gateway/card-facet) use to preview a Select/Checkboxes facet's real
 * options while editing -- the same discovered values Facet_Query::
 * get_facet_options()/get_facet_options_for_collection() already hand
 * render.php for the front end, exposed here so the editor's own preview
 * (previously a single static placeholder option/checkbox -- see each
 * block's own edit.js) can show the SAME real list a visitor would see,
 * for both UI types alike.
 *
 * Two separate routes, not one with a type param, for the same reason
 * Columns_REST_Controller keeps /columns/<post_type> and
 * /columns-for-collection/<class> apart: sanitize_key() (needed for a
 * post type slug) lowercases everything, which would corrupt a model's
 * real, case-sensitive class name.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Facet_Options_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/facet-options/<post_type>?key=<field>
	 * GET /gateway/v1/facet-options-for-collection/<class>?key=<field>
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/facet-options/(?P<post_type>[a-zA-Z0-9_-]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_options' ),
				// Same per-post-type edit_posts gate as Columns_REST_Controller's
				// own post-type route -- this is editor-only, and reveals
				// nothing a column-picker request for the same post type
				// wouldn't already.
				'permission_callback' => array( Columns_REST_Controller::class, 'permissions_check' ),
				'args'                => array(
					'post_type' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_key',
					),
					'key'       => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/facet-options-for-collection/(?P<class>[A-Za-z0-9_]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_options_for_collection' ),
				// Same manage_options gate as Columns_REST_Controller's own
				// collection route -- models are an admin-only concept
				// throughout this plugin.
				'permission_callback' => array( Columns_REST_Controller::class, 'collection_permissions_check' ),
				'args'                => array(
					// Deliberately not sanitize_key() -- see class docblock.
					'class' => array(
						'required' => true,
						'type'     => 'string',
					),
					'key'   => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_options( \WP_REST_Request $request ) {
		$post_type = sanitize_key( $request->get_param( 'post_type' ) );

		if ( ! post_type_exists( $post_type ) ) {
			return new \WP_Error(
				'gateway_invalid_post_type',
				__( 'Invalid post type.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$column = Column_Registry::get_column( $post_type, (string) $request->get_param( 'key' ) );

		// Not a real, currently-filterable column for this post type --
		// nothing to discover options for (a stale/hand-crafted request,
		// or a field that's since stopped being filterable).
		if ( ! $column || empty( $column['isFilterable'] ) ) {
			return rest_ensure_response( array() );
		}

		return rest_ensure_response( Facet_Query::get_facet_options( $post_type, $column ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_options_for_collection( \WP_REST_Request $request ) {
		$class_name = (string) $request->get_param( 'class' );

		if ( ! Model_Registry::has( $class_name ) || ! class_exists( $class_name ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$column = Column_Registry::get_column_for_collection( $class_name, (string) $request->get_param( 'key' ) );

		if ( ! $column || empty( $column['isFilterable'] ) ) {
			return rest_ensure_response( array() );
		}

		return rest_ensure_response( Facet_Query::get_facet_options_for_collection( $class_name, $column ) );
	}
}
