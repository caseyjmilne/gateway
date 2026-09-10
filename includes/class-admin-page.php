<?php
/**
 * Registers the single top-level "Gateway" wp-admin page and loads the
 * plugin's React admin app into it.
 *
 * The app itself is a plain React app built with Vite, not
 * @wordpress/scripts (see admin-app/README.md and this plugin's own
 * README.md, "The Gateway admin app" section) -- kept as its own
 * self-contained project (own package.json/vite.config.js) so it never
 * shares a build pipeline with the Gutenberg blocks under blocks/. Only
 * the committed admin-app/build/ output is ever enqueued here, exactly
 * like each block's own committed build/ directory.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Admin_Page {

	const PAGE_SLUG   = 'gateway';
	const APP_ROOT_ID = 'gateway-admin-app';
	const HANDLE      = 'gateway-admin-app';

	/**
	 * Hook suffix add_menu_page() returns, used to only enqueue the app's
	 * assets on its own page. Populated by register_page(), read by
	 * enqueue_assets().
	 *
	 * @var string|false
	 */
	private static $hook_suffix = false;

	/**
	 * Hook page + asset registration into WordPress.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_page' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
	}

	/**
	 * Register the top-level "Gateway" menu page.
	 *
	 * Also explicitly registers a SELF-referencing submenu (same slug as
	 * the parent) -- `add_menu_page()` alone never does this on its own.
	 * Without it, clicking the top-level "Gateway" item doesn't
	 * necessarily land here at all: WordPress's admin menu renderer sends
	 * a top-level click to whatever its FIRST registered submenu item's
	 * URL is, UNLESS one of those submenus shares the parent's own slug
	 * (in which case that one wins). Once `gateway_templates` registers
	 * itself as a submenu here too (`Template_Post_Type`'s own
	 * `show_in_menu => self::PAGE_SLUG`, handled by WordPress core's
	 * `_add_post_type_submenus()`), it becomes the ONLY submenu unless
	 * this one exists alongside it -- which is exactly what caused
	 * "Gateway" to open `edit.php?post_type=gateway_templates` instead of
	 * this page, reported directly. Registering this self-submenu FIRST
	 * (order among `$submenu['gateway']` entries doesn't actually matter
	 * for this specific behavior, but registering it here keeps the
	 * reasoning next to the parent's own registration) guarantees the
	 * top-level click always resolves back to `render_page()`, regardless
	 * of how many other real submenus (the Templates CPT, or a future
	 * one) get added alongside it.
	 */
	public static function register_page() {
		self::$hook_suffix = add_menu_page(
			__( 'Gateway', 'gateway' ),
			__( 'Gateway', 'gateway' ),
			'manage_options',
			self::PAGE_SLUG,
			array( __CLASS__, 'render_page' ),
			'dashicons-database',
			75
		);

		add_submenu_page(
			self::PAGE_SLUG,
			__( 'Gateway', 'gateway' ),
			__( 'Gateway', 'gateway' ),
			'manage_options',
			self::PAGE_SLUG,
			array( __CLASS__, 'render_page' )
		);
	}

	/**
	 * Enqueue the admin app's build output, only on its own page.
	 *
	 * @param string $hook Current admin page hook suffix.
	 */
	public static function enqueue_assets( $hook ) {
		if ( ! self::$hook_suffix || $hook !== self::$hook_suffix ) {
			return;
		}

		$script_path = GATEWAY_ADMIN_APP_DIR . '/build/app.js';
		$style_path  = GATEWAY_ADMIN_APP_DIR . '/build/app.css';

		if ( ! file_exists( $script_path ) ) {
			// Not built yet (see admin-app/README.md) -- render_page()'s
			// empty root div is left in place rather than erroring.
			return;
		}

		// Loads WordPress's own media library JS (wp.media) and its
		// stylesheet -- an Image field's own picker in RecordForm opens
		// the exact same modal a post editor's Featured Image button
		// does, rather than this plugin building its own upload UI from
		// scratch.
		wp_enqueue_media();

		// Loads TinyMCE/quicktags and everything else `window.wp.editor.
		// initialize()` needs -- a WYSIWYG field's own editor is the
		// exact same classic editor a post's own content field (and
		// ACF's own WYSIWYG field) uses, not a bundled rich-text library
		// of this plugin's own.
		wp_enqueue_editor();

		// Keeps `GatewayAdmin.nonce` (below) from ever actually going
		// stale while this page's own tab stays open -- per a direct
		// report: "Sometimes we randomly get 'Cookie check failed' in
		// the app usually after a period away from the site. User is
		// still logged in and the error is not expected." That message
		// is WordPress core's own `rest_cookie_invalid_nonce` error
		// (`rest_cookie_check_errors()`), thrown whenever a REST
		// request's own `X-WP-Nonce` header fails `wp_verify_nonce(...,
		// 'wp_rest')` -- entirely independent of whether the user's
		// actual LOGIN session/cookie is still valid (which is exactly
		// why the site correctly still shows them as logged in when
		// this happens). A `wp_create_nonce()` value is only valid for
		// two ~12-hour "ticks" (~24 hours total) after being generated --
		// this app is a single-page app that never reloads on its own,
		// so the ONE nonce baked into `GatewayAdmin.nonce` at the moment
		// this page was first loaded is the only one it would EVER have
		// used, no matter how many hours/days that browser tab stayed
		// open, without this.
		//
		// `wp_enqueue_script( 'heartbeat' )` plus the inline listener
		// below is the exact mechanism every other nonce-refreshing
		// WP-admin screen already relies on (this is what keeps the
		// block editor's own `wp.apiFetch` REST calls working
		// indefinitely too) -- WordPress core's own Heartbeat AJAX
		// handler automatically includes a freshly-generated `rest-nonce`
		// in EVERY tick's response for a still-logged-in user (no PHP of
		// ours needs to add it), and the client-side Heartbeat API
		// itself already fires a tick immediately whenever a
		// backgrounded tab becomes visible again -- precisely the
		// "after a period away from the site" moment the report
		// describes, refreshing the nonce before this app would ever
		// get a chance to use the stale one.
		wp_enqueue_script( 'heartbeat' );
		wp_add_inline_script(
			'heartbeat',
			'jQuery( document ).on( "heartbeat-tick", function ( event, data ) {'
			. 'if ( data && data["rest-nonce"] && window.GatewayAdmin ) {'
			. 'window.GatewayAdmin.nonce = data["rest-nonce"];'
			. '}'
			. '} );'
		);

		wp_enqueue_script(
			self::HANDLE,
			GATEWAY_ADMIN_APP_URL . '/build/app.js',
			array(),
			(string) filemtime( $script_path ),
			true
		);

		if ( file_exists( $style_path ) ) {
			wp_enqueue_style(
				self::HANDLE,
				GATEWAY_ADMIN_APP_URL . '/build/app.css',
				array(),
				(string) filemtime( $style_path )
			);
		}

		wp_localize_script(
			self::HANDLE,
			'GatewayAdmin',
			array(
				'apiUrl'         => esc_url_raw( rest_url( 'gateway/v1' ) ),
				'nonce'          => wp_create_nonce( 'wp_rest' ),
				'rootId'         => self::APP_ROOT_ID,
				'adminUrl'       => esc_url_raw( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) ),
				// WordPress's own oEmbed proxy route -- a different REST
				// namespace entirely (`oembed/1.0`, not this plugin's own
				// `gateway/v1`), so it needs its own full URL rather than
				// being reachable through `apiUrl` above. `OEmbedPicker.jsx`
				// is the only thing that reads this.
				'oembedProxyUrl' => esc_url_raw( rest_url( 'oembed/1.0/proxy' ) ),
				// The bare WP REST root (no namespace) -- same reasoning as
				// oembedProxyUrl above, one route below it
				// (`wp/v2/pages`/`wp/v2/posts`) is WordPress core's own,
				// not this plugin's `gateway/v1`. `LinkPicker.jsx`'s own
				// searchLinkableContent() is the only thing that reads
				// this today.
				'wpApiUrl'       => esc_url_raw( rest_url() ),
				// The bare wp-admin root (e.g. "https://example.com/wp-admin/"),
				// used by `PermalinkEditor.jsx` to build a direct link to a
				// Model's own Template post -- `post.php?post={id}&action=edit`
				// when one already exists, `post-new.php?post_type=gateway_templates`
				// to create one -- rather than this plugin's own single
				// `admin.php?page=gateway` page, which has nothing to do
				// with editing a real post's content.
				'wpAdminUrl'     => esc_url_raw( admin_url() ),
				// The site's own front-end root, e.g. "https://example.com/" --
				// used to build a real, clickable front-end link for a
				// record whose model has a fully-configured Permalink field
				// (Root set AND a Template built -- see Permalink_Routes::
				// register_rules()'s own matching requirement). Nothing
				// server-side resolves this per record; it's plain string
				// concatenation (homeUrl + root + slug) on the admin app's
				// own side -- see admin-app/src/utils/permalink.js.
				'homeUrl'        => esc_url_raw( home_url( '/' ) ),
			)
		);
	}

	/**
	 * Render the (otherwise empty) page -- the React app mounts into this
	 * div once its script runs.
	 */
	public static function render_page() {
		echo '<div id="' . esc_attr( self::APP_ROOT_ID ) . '"></div>';
	}
}
