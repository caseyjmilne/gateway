<?php
/**
 * Small, admin-only REST routes Post_Object_Field_Type's own admin-app UI
 * needs -- `PostObjectPicker.jsx`'s close sibling of `User_REST_Controller`
 * (for User) and `Records_REST_Controller::search_records()` (for Relate
 * to One/Relate to Many), just pointed at WP's own posts (across
 * whichever post types) instead of `wp_users` or a Gateway model's own
 * records table.
 *
 * A dedicated Gateway-side route, not a direct client-side call against
 * WordPress's own `wp/v2/<post_type>` routes the way `LinkPicker.jsx`'s
 * own `searchLinkableContent()` (`api.js`) already makes for Pages/Posts
 * -- that works there because Link never filters by taxonomy at all, but
 * Post_Object_Field_Type's own "Filter by Taxonomy" setting needs a real
 * `tax_query`, and each CUSTOM taxonomy's own REST query param name
 * (`category`/`post_tag`/a custom `rest_base`) isn't something the
 * client can reliably guess across arbitrary post types -- `WP_Query`
 * here, server-side, is what actually makes an arbitrary-taxonomy filter
 * possible at all.
 *
 * - `GET /gateway/v1/posts/search?q=&post_types=&post_statuses=&taxonomies=&exclude=` --
 *   searches this site's own posts, filtered by whichever of the three
 *   comma-separated params are given (each defaulting to "no
 *   restriction" the same way an unconfigured Filter by ... setting
 *   does -- see this method's own docblock for exactly what each
 *   default resolves to), returning `{id, label, type}` triples -- the
 *   same minimal `{id, label}` shape `Records_REST_Controller::search_records()`/
 *   `User_REST_Controller::search_users()` already return for their own
 *   pickers, plus `type` (the post's own post type slug) so
 *   `PostObjectPicker.jsx` can show it as a small badge the same way
 *   `LinkPicker.jsx`'s own search results already do. `exclude`
 *   (comma-joined already-selected post ids) keeps an already-picked
 *   post out of its own search results, same as the other two search
 *   routes.
 *
 * - `GET /gateway/v1/posts/<id>` -- one post's own `{id, label, type}`
 *   shape, found by id instead of a search term -- for
 *   `PostObjectPicker.jsx`'s own preview when a field's `return_format`
 *   is `'id'`: the record's own value in that case is a bare integer (or
 *   array of them), with nothing else to build a chip/preview from
 *   without this (the same "return_format 'id' has nothing else to
 *   build a preview from" gap `Media_REST_Controller::get_media()`/
 *   `User_REST_Controller::get_user()` already fill for their own types).
 *
 * - `GET /gateway/v1/post-types` / `GET /gateway/v1/taxonomies` -- the
 *   option lists `FieldEditor.jsx`'s own Filter by Post Type/Taxonomy
 *   widgets (`FilterMultiSelect.jsx`, via `usePostTypes.js`/
 *   `useTaxonomies.js`) build from. A real bug, reported directly TWICE:
 *   "post types should be public only in this case Post, Page, Media
 *   instead we are getting also system CPT's" -- and, after switching
 *   from a direct `wp/v2/types`/`wp/v2/taxonomies` client-side call
 *   (which only ever filters by `show_in_rest`, a wholly different
 *   registration flag from `public`) to
 *   `get_post_types( array( 'public' => true ) )`/`get_taxonomies( array(
 *   'public' => true ) )` -- the exact real WordPress core filter
 *   `search_posts()`'s own unrestricted default already used -- STILL
 *   true, per the exact follow-up list of what was still showing
 *   (Navigation Menu Items/Patterns/Templates/Template Parts/Global
 *   Styles/Navigation Menus/Font Families/Font Faces): several of
 *   WordPress's own block-editor/Site-Editor-internal types are, despite
 *   never being real site content, ACTUALLY REGISTERED with
 *   `'public' => true` in current WordPress core (an admin-facing UI in
 *   that narrow technical sense, not "public content"), so the `public`
 *   filter alone was never going to exclude them either. `INTERNAL_POST_TYPES`/
 *   `INTERNAL_TAXONOMIES` below name every one of them explicitly, by
 *   slug -- the only reliable way to exclude a fixed, known set of
 *   WordPress's own internals regardless of whatever their own `public`
 *   registration happens to be -- applied to `list_post_types()`/
 *   `list_taxonomies()` below AND folded into `search_posts()`'s own
 *   unrestricted default above, so an unconfigured Post Object field's
 *   actual search can't surface a Template/Pattern/etc. either. Unlike
 *   that default (which also excludes `'attachment'`), `'attachment'`
 *   is deliberately NOT in either list here -- this is the OPTIONS list
 *   for what Filter by Post Type can be configured TO, and Media is one
 *   of the three real, sensible choices a site owner can pick (Post,
 *   Page, Media, on a stock install), not a restriction on what an
 *   UNCONFIGURED field searches by default.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Post_REST_Controller {

	const NAMESPACE_   = 'gateway/v1';
	const SEARCH_LIMIT = 20;

	/**
	 * WordPress's own internal, block-editor/Site-Editor-only post
	 * types -- never a genuine piece of site content, so excluded
	 * EVERYWHERE this class offers a post type, regardless of their own
	 * `public` registration value (see this class's own docblock for why
	 * `public => true` alone isn't enough). `nav_menu_item` is here too
	 * even though it predates the block editor -- a single menu item is
	 * never a sensible "Post Object" to pick either.
	 *
	 * @var string[]
	 */
	const INTERNAL_POST_TYPES = array(
		'nav_menu_item',
		'wp_block',
		'wp_template',
		'wp_template_part',
		'wp_global_styles',
		'wp_navigation',
		'wp_font_family',
		'wp_font_face',
	);

	/**
	 * The taxonomy equivalent of `INTERNAL_POST_TYPES` above -- WordPress's
	 * own internal taxonomies backing the block editor/Site Editor/nav
	 * menus, never something a site owner would want to filter real
	 * content BY.
	 *
	 * @var string[]
	 */
	const INTERNAL_TAXONOMIES = array(
		'nav_menu',
		'wp_theme',
		'wp_template_part_area',
		'wp_pattern_category',
		'link_category',
	);

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * `/search` is registered BEFORE `/(?P<id>\d+)` -- same "the more
	 * specific literal route first is the clearer, safer convention"
	 * reasoning `User_REST_Controller::register_routes()`'s own docblock
	 * already gives for its identical ordering.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/posts/search',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'search_posts' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/posts/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_post_option' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/post-types',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_post_types' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/taxonomies',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_taxonomies' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);
	}

	/**
	 * Same gate as the rest of the Models/Fields/Records admin API --
	 * `manage_options`, not something narrower -- same reasoning
	 * `User_REST_Controller::permissions_check()`'s own docblock already
	 * gives for its identical choice.
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
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function search_posts( \WP_REST_Request $request ) {
		$query_text   = trim( (string) $request->get_param( 'q' ) );
		$post_types   = self::split_param( $request->get_param( 'post_types' ) );
		$post_statuses = self::split_param( $request->get_param( 'post_statuses' ) );
		$taxonomies   = self::split_param( $request->get_param( 'taxonomies' ) );
		$exclude_ids  = array_filter( array_map( 'absint', explode( ',', (string) $request->get_param( 'exclude' ) ) ) );

		// No Filter by Post Type configured -- every PUBLIC post type
		// except 'attachment' (a media item was never a sensible "Post
		// Object" to pick) and WordPress's own internal block-editor
		// types (INTERNAL_POST_TYPES -- see this class's own docblock for
		// why `public => true` alone doesn't already exclude them), the
		// same "no restriction configured" default every other Filter
		// by ... setting on this field gets.
		if ( empty( $post_types ) ) {
			$post_types = array_values(
				array_diff(
					get_post_types( array( 'public' => true ) ),
					array_merge( array( 'attachment' ), self::INTERNAL_POST_TYPES )
				)
			);
		}

		$args = array(
			'post_type'      => $post_types,
			'post_status'    => empty( $post_statuses ) ? array( 'publish' ) : $post_statuses,
			'posts_per_page' => self::SEARCH_LIMIT,
			'orderby'        => 'title',
			'order'          => 'ASC',
			'no_found_rows'  => true,
		);

		if ( '' !== $query_text ) {
			$args['s'] = $query_text;
		}

		if ( $exclude_ids ) {
			$args['post__not_in'] = $exclude_ids;
		}

		if ( ! empty( $taxonomies ) ) {
			// 'EXISTS' -- no specific TERM to match, just "this post has
			// ANY term in one of these taxonomies at all." Filter by
			// Taxonomy restricts by TAXONOMY, not by a chosen term within
			// one (matching what "Each of these is an autocomplete
			// searchable of the relevant data" -- the relevant data for
			// this one being the site's own registered taxonomies --
			// actually asked for), so this is deliberately as specific as
			// that setting's own real granularity gets. `'relation' =>
			// 'OR'` -- a post matching ANY of the selected taxonomies
			// passes, not all of them at once.
			$args['tax_query'] = array( 'relation' => 'OR' ); // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query

			foreach ( $taxonomies as $taxonomy ) {
				$args['tax_query'][] = array(
					'taxonomy' => $taxonomy,
					'operator' => 'EXISTS',
				);
			}
		}

		$query = new \WP_Query( $args );

		return rest_ensure_response(
			array_map(
				function ( $post ) {
					return array(
						'id'    => $post->ID,
						'label' => get_the_title( $post ) ?: sprintf( '(#%d)', $post->ID ), // phpcs:ignore WordPress.PHP.DisallowShortTernary.Found
						'type'  => $post->post_type,
					);
				},
				$query->posts
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_post_option( \WP_REST_Request $request ) {
		$id   = (int) $request->get_param( 'id' );
		$post = get_post( $id );

		if ( ! $post ) {
			return new \WP_Error(
				'gateway_post_not_found',
				__( 'Post not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response(
			array(
				'id'    => $id,
				'label' => get_the_title( $post ) ?: sprintf( '(#%d)', $id ), // phpcs:ignore WordPress.PHP.DisallowShortTernary.Found
				'type'  => $post->post_type,
			)
		);
	}

	/**
	 * `FieldEditor.jsx`'s own Filter by Post Type option list --
	 * `get_post_types( array( 'public' => true ), 'objects' )`, the same
	 * real WordPress core filter `search_posts()`'s own unrestricted
	 * default above already uses, NOT `wp/v2/types`'s own
	 * `show_in_rest`-based listing -- further excluding `INTERNAL_POST_TYPES`
	 * (see this class's own docblock for why `public => true` alone,
	 * confirmed on a real site, still wasn't enough). Sorted by label --
	 * `get_post_types()` itself returns them in REGISTRATION order, which
	 * is meaningless to a site owner scanning an options list.
	 * `'attachment'` is deliberately included (as "Media") -- this is the
	 * OPTIONS list, not the unrestricted search default, and Media is a
	 * real, sensible choice here.
	 *
	 * @return \WP_REST_Response
	 */
	public static function list_post_types() {
		$post_types = get_post_types( array( 'public' => true ), 'objects' );
		$options    = array();

		foreach ( $post_types as $post_type ) {
			if ( in_array( $post_type->name, self::INTERNAL_POST_TYPES, true ) ) {
				continue;
			}

			$options[] = array(
				'value' => $post_type->name,
				'label' => $post_type->label,
			);
		}

		usort( $options, function ( $a, $b ) {
			return strcasecmp( $a['label'], $b['label'] );
		} );

		return rest_ensure_response( $options );
	}

	/**
	 * `FieldEditor.jsx`'s own Filter by Taxonomy option list -- the exact
	 * same "`public` => true, via real WordPress core functions, not
	 * `wp/v2`'s own `show_in_rest`-based listing, further excluding a
	 * known internal list" reasoning `list_post_types()` just above
	 * already gives, just `get_taxonomies()`/`INTERNAL_TAXONOMIES`
	 * instead of `get_post_types()`/`INTERNAL_POST_TYPES`.
	 *
	 * @return \WP_REST_Response
	 */
	public static function list_taxonomies() {
		$taxonomies = get_taxonomies( array( 'public' => true ), 'objects' );
		$options    = array();

		foreach ( $taxonomies as $taxonomy ) {
			if ( in_array( $taxonomy->name, self::INTERNAL_TAXONOMIES, true ) ) {
				continue;
			}

			$options[] = array(
				'value' => $taxonomy->name,
				'label' => $taxonomy->label,
			);
		}

		usort( $options, function ( $a, $b ) {
			return strcasecmp( $a['label'], $b['label'] );
		} );

		return rest_ensure_response( $options );
	}

	/**
	 * A comma-joined request param (post_types/post_statuses/taxonomies)
	 * into a trimmed, non-empty array of slugs -- `null`/`''` (the param
	 * simply wasn't sent, or a field's own Filter by ... setting isn't
	 * configured at all) becomes `[]`, this method's own callers'
	 * shared signal for "no restriction."
	 *
	 * @param string|null $raw Comma-joined slugs, or null.
	 * @return string[]
	 */
	private static function split_param( $raw ) {
		if ( null === $raw || '' === trim( (string) $raw ) ) {
			return array();
		}

		return array_values(
			array_filter(
				array_map( 'sanitize_text_field', array_map( 'trim', explode( ',', (string) $raw ) ) )
			)
		);
	}
}
