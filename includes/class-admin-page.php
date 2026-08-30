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
				'apiUrl'   => esc_url_raw( rest_url( 'gateway/v1' ) ),
				'nonce'    => wp_create_nonce( 'wp_rest' ),
				'rootId'   => self::APP_ROOT_ID,
				'adminUrl' => esc_url_raw( admin_url( 'admin.php?page=' . self::PAGE_SLUG ) ),
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
