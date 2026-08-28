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
 * gateway/v1/data-cards-collection/<class> is the Collection counterpart
 * of the route above -- genuinely separate rather than one route with a
 * source-type param, for the same reason Columns_REST_Controller keeps
 * /columns/<post_type> and /columns-for-collection/<class> apart:
 * sanitize_key() (needed for a post type slug) lowercases everything,
 * which would corrupt a model's real, case-sensitive class name. It
 * accepts `facets` the same way the post-type route does (Collections
 * DO support facets -- see Column_Registry::get_columns_for_collection()/
 * Facet_Query::apply_collection_facets()); it never accepts `search` --
 * see Data_Cards_Renderer::get_collection_page()'s own docblock for why
 * Collections don't support that yet.
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
	 * GET /gateway/v1/data-cards-collection/<class>
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
					'facets'      => array(
						'type'    => 'string',
						'default' => '',
						// Deliberately no sanitize_callback here --
						// sanitize_text_field() strips tag-like sequences,
						// which a legitimate facet *value* could contain,
						// corrupting the JSON before it's ever decoded.
						// get_items() below json_decode()s this raw and
						// validates every field of the result explicitly
						// (Facet_Query::validate_facets()), which is the
						// real trust boundary here, not this callback.
					),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/data-cards-collection/(?P<collection>[A-Za-z0-9_]+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_collection_items' ),
				// Public, same rationale as the post-type route above --
				// this only ever re-renders a template the server already
				// vouched for (see class docblock), for records this same
				// page already rendered once with no permission check
				// either.
				'permission_callback' => '__return_true',
				'args'                => array(
					// Deliberately not sanitize_key() -- see class docblock.
					'collection'  => array(
						'required' => true,
						'type'     => 'string',
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
					'facets'      => array(
						'type'    => 'string',
						'default' => '',
						// Deliberately no sanitize_callback -- same reasoning
						// as the post-type route's own 'facets' arg above.
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

		// A visitor's own live facet state (see shared/cards.js's
		// collectActiveFacets()) -- json_decode()'d and re-validated here,
		// never trusted as-is: Facet_Query::validate_facets() drops
		// anything whose key isn't a real, isFilterable column for this
		// post type, exactly the same boundary
		// gateway/data-cards/render.php applies to its own configured
		// (default-value) facets.
		$raw_facets = json_decode( (string) $request->get_param( 'facets' ), true );

		$available_columns = array();

		foreach ( Column_Registry::get_columns( $post_type ) as $available_column ) {
			$available_columns[ $available_column['key'] ] = $available_column;
		}

		$facets = is_array( $raw_facets ) ? Facet_Query::validate_facets( $raw_facets, $available_columns ) : array();

		$query_args = Data_Cards_Renderer::get_query_args( $post_type, $page, $page_size, $search );
		$query_args = Facet_Query::apply_facets( $query_args, $facets );
		$query      = new \WP_Query( $query_args );

		$html       = Data_Cards_Renderer::render_items( $query, $template_blocks, $limit, $page, $page_size );
		$pager_meta = Data_Cards_Renderer::build_pager_meta( $query, $page, $page_size, $limit );

		return rest_ensure_response( array_merge( array( 'html' => $html ), $pager_meta ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_collection_items( \WP_REST_Request $request ) {
		$collection = (string) $request->get_param( 'collection' );

		if ( ! Model_Registry::has( $collection ) || ! class_exists( $collection ) ) {
			return new \WP_Error(
				'gateway_invalid_collection',
				__( 'Invalid Collection.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$template_id = sanitize_key( $request->get_param( 'template_id' ) );
		$template    = get_transient( 'gwdc_tpl_' . $template_id );

		if ( false === $template || ! is_string( $template ) ) {
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

		// A visitor's own live facet state -- same re-validation boundary
		// as get_items()'s own postType handling above, against this
		// Collection's own available columns instead.
		$raw_facets = json_decode( (string) $request->get_param( 'facets' ), true );

		$available_columns = array();

		foreach ( Column_Registry::get_columns_for_collection( $collection ) as $available_column ) {
			$available_columns[ $available_column['key'] ] = $available_column;
		}

		$facets = is_array( $raw_facets ) ? Facet_Query::validate_facets( $raw_facets, $available_columns ) : array();

		$page_result = Data_Cards_Renderer::get_collection_page( $collection, $page, $page_size, $limit, $facets, $template_blocks );
		$html        = Data_Cards_Renderer::render_items_for_collection( $page_result['records'], $template_blocks );

		return rest_ensure_response( array_merge( array( 'html' => $html ), $page_result['pager_meta'] ) );
	}
}
