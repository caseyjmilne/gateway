<?php
/**
 * The `gateway_templates` custom post type -- where a single-record
 * template (a real block-editor page wrapping `gateway/single-record`)
 * lives, replacing the earlier design where a site owner picked an
 * arbitrary WordPress Page for this and pointed a Model's own Permalink
 * settings at it.
 *
 * That earlier design was reported directly as circular: create a Page,
 * insert `gateway/single-record` into it and set ITS OWN `collection`
 * attribute, then go to a completely different admin screen (the Model's
 * own Permalinks tab) and point `template_page_id` back at that same
 * Page -- two independent settings both naming the same relationship,
 * with `blocks/single-record/render.php` having to defensively
 * cross-check them at render time because nothing stopped them from
 * disagreeing.
 *
 * This class flips the direction instead: a `gateway_templates` post
 * declares, via its own `META_COLLECTION` meta (edited from a real
 * sidebar setting -- see `blocks/single-record/src/template-panel.js`),
 * which Collection it's for. `Permalink_Routes` discovers the pairing by
 * asking `find_for_class()` below, rather than reading a Model-side
 * pointer -- there is exactly one place this association lives now.
 *
 * `show_in_menu => 'gateway'` is what nests this CPT's own list/edit
 * screens directly under the existing top-level "Gateway" admin menu
 * (`Admin_Page::PAGE_SLUG`) -- WordPress does this automatically for any
 * post type registered with `show_ui => true` and `show_in_menu` set to
 * another menu's own slug; no `add_submenu_page()` call is needed here
 * at all.
 *
 * The `template`/`template_lock` args below are WordPress's own native,
 * per-post-type block-editor scaffold (distinct from Full Site Editing's
 * `wp_template` entities, which need a block theme this plugin can't
 * assume -- confirmed unused anywhere in this codebase) -- every fresh
 * "Add New Template" post starts with a real `gateway/single-record`
 * block already in place, `template_lock: false` so it's freely editable
 * from there, not perpetually re-enforced.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Template_Post_Type {

	const POST_TYPE = 'gateway_templates';

	/**
	 * Which Model/Collection class this Template post is for -- the one
	 * place this association lives (see this file's own docblock). Set
	 * via a `PluginDocumentSettingPanel` in the block editor sidebar
	 * (`blocks/single-record/src/template-panel.js`), never a block
	 * attribute.
	 */
	const META_COLLECTION = '_gateway_template_collection';

	/**
	 * Which record previews inside this Template while it's being
	 * designed -- the exact same purpose `gateway/single-record`'s own
	 * (now-removed) `previewRecordId` attribute served, just moved to
	 * post meta alongside `META_COLLECTION` rather than living on the
	 * block. `Permalink_Routes::resolve_preview_record()` reads this
	 * directly for the front-end "direct visit to the Template's own
	 * URL" fallback -- see that method's own docblock.
	 */
	const META_PREVIEW_RECORD_ID = '_gateway_template_preview_record_id';

	/**
	 * Hook registration into WordPress.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		add_filter( 'wp_sitemaps_post_types', array( __CLASS__, 'exclude_from_sitemaps' ) );
		add_filter( 'rest_pre_insert_' . self::POST_TYPE, array( __CLASS__, 'validate_collection_uniqueness' ), 10, 2 );
	}

	/**
	 * Registers the post type itself and its two meta keys.
	 */
	public static function register() {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'              => array(
					'name'               => __( 'Templates', 'gateway' ),
					'singular_name'      => __( 'Template', 'gateway' ),
					'add_new'            => __( 'Add New', 'gateway' ),
					'add_new_item'       => __( 'Add New Template', 'gateway' ),
					'edit_item'          => __( 'Edit Template', 'gateway' ),
					'new_item'           => __( 'New Template', 'gateway' ),
					'view_item'          => __( 'View Template', 'gateway' ),
					'search_items'       => __( 'Search Templates', 'gateway' ),
					'not_found'          => __( 'No templates found.', 'gateway' ),
					'not_found_in_trash' => __( 'No templates found in Trash.', 'gateway' ),
					'all_items'          => __( 'Templates', 'gateway' ),
				),
				// public/publicly_queryable: a real visitor's own
				// /{root}/{slug} request resolves to one of these posts
				// (see Permalink_Routes::register_rules()'s own rewrite
				// target) -- it has to be genuinely loadable by WordPress's
				// main query, the same requirement a Page had under the
				// earlier design.
				'public'              => true,
				'publicly_queryable'  => true,
				'show_ui'             => true,
				// Nests under the existing top-level Gateway menu -- see
				// this file's own docblock.
				'show_in_menu'        => 'gateway',
				// Never a real nav-menu picker item -- a Template is a
				// once-per-record stamp, not standalone navigable content.
				'show_in_nav_menus'   => false,
				// Required for the block editor itself, and for
				// register_post_meta()'s own REST exposure below.
				'show_in_rest'        => true,
				// A Template is never a real, distinct search result --
				// visiting it directly (no slug) only ever shows whichever
				// record Permalink_Routes::resolve_preview_record() picks,
				// and every real /{root}/{slug} URL is a DIFFERENT
				// resource entirely as far as search/indexing is concerned.
				'exclude_from_search' => true,
				// Permalink_Routes owns every real URL to these (both the
				// real /{root}/{slug} rewrite and the Template's own
				// preview URL, via ?p=<id>&post_type=gateway_templates) --
				// no pretty permalink or archive of its own is needed.
				'rewrite'             => false,
				'has_archive'         => false,
				'supports'            => array( 'title', 'editor', 'custom-fields' ),
				'template'            => array(
					array(
						'gateway/single-record',
						array(),
						array(
							array(
								'core/paragraph',
								array(
									'placeholder' => __( 'Design this record’s page…', 'gateway' ),
								),
							),
						),
					),
				),
				'template_lock'       => false,
			)
		);

		register_post_meta(
			self::POST_TYPE,
			self::META_COLLECTION,
			array(
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'sanitize_text_field',
				'auth_callback'     => array( __CLASS__, 'meta_auth_callback' ),
			)
		);

		register_post_meta(
			self::POST_TYPE,
			self::META_PREVIEW_RECORD_ID,
			array(
				'type'              => 'integer',
				'single'            => true,
				'show_in_rest'      => true,
				'sanitize_callback' => 'absint',
				'auth_callback'     => array( __CLASS__, 'meta_auth_callback' ),
			)
		);
	}

	/**
	 * Same gate every other Gateway-managed post meta/setting in this
	 * plugin uses for an admin-only concern -- a Collection is never
	 * something a lower-privileged post editor should be reassigning.
	 *
	 * @return bool
	 */
	public static function meta_auth_callback() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * @param string[] $post_types Post type names already included.
	 * @return string[]
	 */
	public static function exclude_from_sitemaps( $post_types ) {
		unset( $post_types[ self::POST_TYPE ] );
		return $post_types;
	}

	/**
	 * Enforces "at most one Template per Collection" -- the same
	 * "declare it, validate it centrally" reasoning
	 * `Field_Type::max_one_per_model()` already established for Permalink
	 * fields, applied here to Templates instead. Hooked on
	 * `rest_pre_insert_{post_type}`, which fires before either the post
	 * OR its meta are actually written for a REST save (the only save
	 * path this CPT has -- `show_in_rest => true` means the block editor
	 * always saves through REST, never the classic `post.php` form
	 * submit) -- checking here, rather than `save_post`, is what lets
	 * this see the INCOMING `collection` value before it's committed,
	 * not whatever was already stored a moment ago.
	 *
	 * @param \stdClass        $prepared_post Post object about to be inserted/updated.
	 * @param \WP_REST_Request $request       The full REST request.
	 * @return \stdClass|\WP_Error
	 */
	public static function validate_collection_uniqueness( $prepared_post, $request ) {
		$meta       = $request->get_param( 'meta' );
		$collection = is_array( $meta ) ? ( $meta[ self::META_COLLECTION ] ?? null ) : null;

		if ( null === $collection || '' === trim( (string) $collection ) ) {
			return $prepared_post;
		}

		$collection  = trim( (string) $collection );
		$existing_id = self::find_for_class( $collection );
		$this_id     = (int) ( $prepared_post->ID ?? 0 );

		if ( $existing_id && $existing_id !== $this_id ) {
			return new \WP_Error(
				'gateway_template_collection_taken',
				sprintf(
					/* translators: %s: model class name */
					__( '"%s" already has a Template -- only one Template is allowed per Model.', 'gateway' ),
					$collection
				),
				array( 'status' => 409 )
			);
		}

		return $prepared_post;
	}

	/**
	 * The one canonical answer to "which Template post is this Model's
	 * own" -- called by `Permalink_Routes` (routing) and the admin app's
	 * own Permalinks tab (status/deep-link). A small, unindexed
	 * `get_posts()` meta query -- the same "small enough that a full
	 * scan costs nothing that matters" reasoning
	 * `Model_Fields::validate_permalink_settings()`'s own cross-model
	 * `root`-uniqueness scan already accepts, applied here to Templates
	 * instead of Models.
	 *
	 * @param string $class_name Model class name.
	 * @return int Post ID, or 0 if this Collection has no Template yet.
	 */
	public static function find_for_class( $class_name ) {
		$posts = get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => 1,
				'meta_key'       => self::META_COLLECTION, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $class_name, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);

		return $posts ? (int) $posts[0] : 0;
	}
}
