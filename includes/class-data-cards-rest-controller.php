<?php
/**
 * REST API route the front end uses to fetch subsequent pages of a
 * gateway/data-cards grid -- pagination, page-size changes, and search all
 * go through this one route, since (unlike gateway/datatable) there's no
 * DataTables instance doing this client-side.
 *
 * Unlike Columns_REST_Controller (editor-only, gated on `edit_posts`),
 * this route is PUBLIC: it's the front-end pagination mechanism for
 * already-published content anyone can already see. The one real security
 * concern -- a public endpoint that could be made to render arbitrary,
 * client-supplied block markup would let any visitor make the server
 * execute any registered block type's render callback with attacker
 * -chosen attributes -- is why this route never accepts a card template
 * directly. Instead, gateway/data-cards-body's own render.php stashes the
 * *server-authored* template in a short-lived transient, keyed by a hash
 * of its own content, and hands the client only that opaque key
 * (`template_id`). This route can only ever re-render a template the
 * server itself already rendered once, for the same post type, within the
 * last hour -- never anything a client invents.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Data_Cards_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/data-cards/<post_type>
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/data-cards/(?P<post_type>[a-zA-Z0-9_-]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_items' ),
				// Public: this only ever re-renders published posts through
				// a template the server already vouched for (see class
				// docblock) -- gating it on a capability would 403 every
				// logged-out visitor trying to page through the grid.
				'permission_callback' => '__return_true',
				'args'                => array(
					'post_type'   => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_key',
					),
					'template_id' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_key',
					),
					'page'        => array(
						'type'              => 'integer',
						'default'           => 0,
						'sanitize_callback' => 'absint',
					),
					'page_size'   => array(
						'type'              => 'integer',
						'default'           => 12,
						'sanitize_callback' => 'absint',
					),
					'limit'       => array(
						'type'              => 'integer',
						'default'           => 0,
						'sanitize_callback' => 'absint',
					),
					'search'      => array(
						'type'              => 'string',
						'default'           => '',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_items( \WP_REST_Request $request ) {
		$post_type = sanitize_key( $request->get_param( 'post_type' ) );

		if ( ! post_type_exists( $post_type ) ) {
			return new \WP_Error(
				'gateway_invalid_post_type',
				__( 'Invalid post type.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$template_id = sanitize_key( $request->get_param( 'template_id' ) );
		$template    = get_transient( 'gwdc_tpl_' . $template_id );

		if ( false === $template || ! is_string( $template ) ) {
			// The transient render.php sets on every full page load expired
			// (visitor has had this page open, unrefreshed, for over an
			// hour) -- 410 tells the front end to reload rather than retry
			// forever against a template it can never get back this way.
			return new \WP_Error(
				'gateway_template_expired',
				__( 'This grid needs to be reloaded.', 'gateway' ),
				array( 'status' => 410 )
			);
		}

		$template_blocks = parse_blocks( $template );
		$page            = absint( $request->get_param( 'page' ) );
		$page_size       = max( 1, absint( $request->get_param( 'page_size' ) ) );
		$limit           = absint( $request->get_param( 'limit' ) );
		$search          = (string) $request->get_param( 'search' );

		$query_args = Data_Cards_Renderer::get_query_args( $post_type, $page, $page_size, $search );
		$query      = new \WP_Query( $query_args );

		$html       = Data_Cards_Renderer::render_items( $query, $template_blocks, $limit, $page, $page_size );
		$pager_meta = Data_Cards_Renderer::build_pager_meta( $query, $page, $page_size, $limit );

		return rest_ensure_response( array_merge( array( 'html' => $html ), $pager_meta ) );
	}
}
