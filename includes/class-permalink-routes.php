<?php
/**
 * WordPress routing for single-page records -- the last piece of the
 * plan described in Model_Fields::permalink_field_for()'s own docblock:
 * a model with a fully-configured Permalink field (`root` set) AND a
 * real Template post declaring itself for that model
 * (`Template_Post_Type::find_for_class()`) gets one rewrite rule,
 * resolving `/{root}/{slug}` through that Template post.
 *
 * The mechanism, end to end:
 * - `register_rules()` (on `init`) adds `^{root}/([^/]+)/?$ ->
 *   index.php?p={template_id}&post_type=gateway_templates&
 *   gateway_model={class}&gateway_slug=$matches[1]` for every currently
 *   routable model, then flushes -- but only when this plugin's own
 *   permalink configuration has actually changed since the last flush (a
 *   stored version compare, mirroring Migration_Runner's own
 *   has_run()/latest_ran_version() versioning rather than, say, a
 *   periodic TTL: a stale rewrite rule means genuinely broken URLs, not
 *   tolerably-stale status info, so this needs to flush exactly on
 *   change, not just eventually). `bump_config_version()` is called by
 *   `Model_Fields` itself wherever a Permalink field's own config
 *   actually changes (see that class's own add()/update()/remove()) --
 *   this class never needs to know WHY a flush is due, only THAT one is.
 * - `register_query_vars()` (on `query_vars`) makes `gateway_model`/
 *   `gateway_slug` visible to `get_query_var()` at all -- WordPress
 *   ignores any query var a rewrite rule produces that isn't on this
 *   allow-list.
 * - `resolve_record()` (on `wp`, after the main query already ran and
 *   matched the real `p`/`post_type`) looks the record up by the model's
 *   own current permalink field/slug. Not found -- or the model/field
 *   named in the URL no longer actually exists or routes at all --
 *   forces a real 404 even though the query already matched a real
 *   post: that post is only ever a template, never itself the thing
 *   being requested.
 * - A visit straight to the Template post's OWN url (e.g.
 *   `/?p=123`, as opposed to `/{root}/{slug}`) never matches the
 *   rewrite rule above at all -- there's no slug in the URL for
 *   `gateway_model`/`gateway_slug` to resolve -- so `resolve_record()`
 *   falls through to `resolve_preview_record()` instead of forcing a 404
 *   (this IS a real, valid post to look at). It mirrors
 *   `gateway/single-record`'s own editor preview exactly: read the SAME
 *   `Template_Post_Type::META_PREVIEW_RECORD_ID` meta the block's own
 *   `template-panel.js` sidebar setting wrote, so a direct look at the
 *   Template shows the SAME record a site owner already chose to
 *   preview it with -- not a second, independent notion of "which
 *   record."
 * - `inject_record_context()` (on `render_block_context`, priority 1,
 *   mirroring Data_Cards_Renderer's own identical-shaped filter) sets
 *   `$context['record']` to whatever `resolve_record()` found, plus
 *   `gateway/data-cards/sourceType`/`collection` context derived from
 *   that same record's own class -- for every block rendered for the
 *   rest of this request. This is what lets `gateway/card-field-text`/
 *   `gateway/related-items` work ANYWHERE on a Template post (not just
 *   nested inside `gateway/single-record`'s own InnerBlocks) without
 *   that block needing to declare `providesContext` of its own at all.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Permalink_Routes {

	/**
	 * Bumped by Model_Fields every time a Permalink field's own config
	 * changes in a way that could affect routing (added, removed, retyped
	 * into/out of Permalink, or its root setting edited) -- compared
	 * against OPTION_FLUSHED_VERSION below to decide whether
	 * register_rules() needs to actually flush this request.
	 */
	const OPTION_CONFIG_VERSION = 'gateway_permalink_config_version';

	/**
	 * The config version that was in effect the last time rewrite rules
	 * were actually flushed -- kept as a SEPARATE option from
	 * OPTION_CONFIG_VERSION (rather than, say, a boolean "dirty" flag)
	 * so register_rules() can tell "already up to date" from "flush
	 * needed" with a single, cheap comparison, the same shape
	 * Migration_Runner::is_up_to_date() already compares latest_ran_version()
	 * against latest_registered_version().
	 */
	const OPTION_FLUSHED_VERSION = 'gateway_permalink_flushed_version';

	/**
	 * The current request's resolved record, if any -- set by
	 * resolve_record() (on `wp`) and read back by inject_record_context()
	 * (on `render_block_context`, which fires later, during template
	 * output). A plain static, not a global -- this class is the only
	 * thing that ever needs to pass this one value from one hook to a
	 * later one within the SAME request; there's no multi-record case
	 * here the way Data_Cards_Renderer::$current has to handle (see that
	 * property's own docblock), since a single-record Template only ever
	 * has one record for the whole request.
	 *
	 * @var \Illuminate\Database\Eloquent\Model|null
	 */
	private static $current_record = null;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_rules' ) );
		add_filter( 'query_vars', array( __CLASS__, 'register_query_vars' ) );
		add_action( 'wp', array( __CLASS__, 'resolve_record' ) );
		// Registered unconditionally, not just once a record actually
		// resolves -- inject_record_context() itself is a no-op whenever
		// $current_record is still null (e.g. every ordinary page on the
		// site that isn't one of these single-record templates at all),
		// so there's nothing to gain by only conditionally adding this,
		// and doing it here means it can never be forgotten on some path
		// through resolve_record() that returns early.
		add_filter( 'render_block_context', array( __CLASS__, 'inject_record_context' ), 1 );
		// Registered unconditionally, same reasoning as inject_record_context()
		// above -- suppress_template_title() itself is a no-op the
		// instant $current_record is still null.
		add_filter( 'the_title', array( __CLASS__, 'suppress_template_title' ), 10, 2 );
	}

	/**
	 * Records that a Permalink field's config changed -- called by
	 * Model_Fields, never anything else. Cheap and unconditional: an
	 * option bump plus, once per request at most, one version comparison
	 * in register_rules() below -- there's no reason to try to prove a
	 * given change couldn't possibly affect routing before paying that
	 * trivial cost.
	 */
	public static function bump_config_version() {
		update_option( self::OPTION_CONFIG_VERSION, (int) get_option( self::OPTION_CONFIG_VERSION, 0 ) + 1 );
	}

	/**
	 * Every model that's actually routable right now -- both
	 * register_rules() and resolve_record() build off this SAME method
	 * (rather than each re-deriving its own notion of "routable") so the
	 * two can never disagree about which models have a real route.
	 * "Routable" means: has a Permalink field at all, its own `root` is
	 * non-blank, AND a `gateway_templates` post declares itself for this
	 * model (`Template_Post_Type::find_for_class()`) -- a `root` with no
	 * Template built yet (or vice versa) simply doesn't route, the
	 * deliberately scoped-down phase-1 answer described in this plugin's
	 * own README rather than a bare built-in fallback template.
	 *
	 * @return array<int,array{class:string,field:string,root:string,template_id:int}>
	 */
	private static function routable_models() {
		$routes = array();

		foreach ( Model_Registry::all() as $class_name ) {
			$field = Model_Fields::permalink_field_for( $class_name );

			if ( ! $field ) {
				continue;
			}

			$settings = $field['settings'] ?? array();
			$root     = is_array( $settings ) ? (string) ( $settings['root'] ?? '' ) : '';

			if ( '' === $root ) {
				continue;
			}

			$template_id = Template_Post_Type::find_for_class( $class_name );

			if ( $template_id <= 0 ) {
				continue;
			}

			$routes[] = array(
				'class'       => $class_name,
				'field'       => $field['name'],
				'root'        => $root,
				'template_id' => $template_id,
			);
		}

		return $routes;
	}

	/**
	 * This ONE model's own routing info, if it's currently routable at
	 * all -- the single-model counterpart to routable_models() above,
	 * for callers that only ever care about one class at a time
	 * (url_for_record() below, and Permalink_REST_Controller's own
	 * read-only route the block editor uses to detect whether
	 * gateway/card-link actually has anything to link to before ever
	 * rendering a single record).
	 *
	 * @param string $class_name Model class name.
	 * @return array{class:string,field:string,root:string,template_id:int}|null
	 */
	public static function route_for_class( $class_name ) {
		foreach ( self::routable_models() as $route ) {
			if ( $route['class'] === $class_name ) {
				return $route;
			}
		}

		return null;
	}

	/**
	 * A real record's own front-end URL, if its model is currently
	 * routable AND this particular record already has a slug of its
	 * own -- the PHP counterpart to admin-app/src/utils/permalink.js's
	 * own getRecordPermalink() (same shape, same reasoning, just against
	 * a real Eloquent record here instead of a REST-shaped one), used by
	 * gateway/card-link's own render.php to build the real `<a href>` it
	 * wraps its inner blocks with. Null for anything short of that: not
	 * a real Eloquent record at all, its model isn't routable (no
	 * Permalink field, or one with no Root set or no Template built
	 * yet), or this specific record has never had a slug computed (e.g.
	 * Auto mode with nothing yet to slugify from).
	 *
	 * @param mixed $record Expected to be a real Eloquent model instance.
	 * @return string|null
	 */
	public static function url_for_record( $record ) {
		if ( ! ( $record instanceof \Illuminate\Database\Eloquent\Model ) ) {
			return null;
		}

		$route = self::route_for_class( get_class( $record ) );

		if ( ! $route ) {
			return null;
		}

		$slug = $record->getAttribute( $route['field'] );

		if ( empty( $slug ) ) {
			return null;
		}

		return home_url( '/' . $route['root'] . '/' . rawurlencode( $slug ) );
	}

	/**
	 * Adds one rewrite rule per routable model, then flushes -- but only
	 * when OPTION_CONFIG_VERSION has actually moved since the last flush
	 * this method itself recorded. Every request still re-adds every
	 * rule (add_rewrite_rule() only ever affects the current request's
	 * in-memory rule set -- WordPress core's own normal pattern, the same
	 * every other rewrite-rule-adding plugin follows), but the expensive
	 * part -- flush_rewrite_rules() recomputing and rewriting the
	 * option WordPress actually matches URLs against -- only runs on
	 * the one request right after something actually changed.
	 */
	public static function register_rules() {
		foreach ( self::routable_models() as $route ) {
			add_rewrite_rule(
				'^' . preg_quote( $route['root'], '#' ) . '/([^/]+)/?$',
				'index.php?p=' . $route['template_id']
					. '&post_type=' . Template_Post_Type::POST_TYPE
					. '&gateway_model=' . rawurlencode( $route['class'] )
					. '&gateway_slug=$matches[1]',
				'top'
			);
		}

		$current_version = (int) get_option( self::OPTION_CONFIG_VERSION, 0 );
		$flushed_version  = get_option( self::OPTION_FLUSHED_VERSION, null );

		// `null` (never flushed before -- a fresh install/activation)
		// forces the first flush unconditionally, same as comparing
		// against an impossible sentinel; every later comparison is a
		// plain int !== int.
		if ( null === $flushed_version || (int) $flushed_version !== $current_version ) {
			flush_rewrite_rules( false );
			update_option( self::OPTION_FLUSHED_VERSION, $current_version );
		}
	}

	/**
	 * @param string[] $vars Already-recognized public query vars.
	 * @return string[]
	 */
	public static function register_query_vars( $vars ) {
		$vars[] = 'gateway_model';
		$vars[] = 'gateway_slug';
		return $vars;
	}

	/**
	 * Resolves the record a single-record URL actually asked for, once
	 * the main query has already run and matched the real template post
	 * -- and forces a genuine 404 the moment anything about that
	 * resolution doesn't check out, exactly as if the post itself didn't
	 * exist. Matching the template post is never enough on its own: that
	 * post is only ever a template, so a slug this model doesn't
	 * actually have is precisely as much a 404 as a URL for a real post
	 * that was never published.
	 */
	public static function resolve_record() {
		// Reset first, unconditionally -- `wp` only ever fires once per
		// real WordPress request, so this never actually matters in
		// production, but leaving a PREVIOUS call's resolved record
		// sitting here through an early-return below would be a latent
		// trap for anything that isn't a single fresh request (a test
		// harness calling this directly more than once, e.g. -- which is
		// exactly how this got caught).
		self::$current_record = null;

		$class_name = (string) get_query_var( 'gateway_model' );
		$slug       = (string) get_query_var( 'gateway_slug' );

		if ( '' === $class_name || '' === $slug ) {
			// No slug at all -- a direct visit to the Template post's own
			// URL, not a real `/{root}/{slug}` request. Never a 404 on its
			// own (see this class's own docblock); see
			// resolve_preview_record()'s own docblock for what happens
			// instead.
			self::resolve_preview_record();
			return;
		}

		if ( ! Model_Registry::has( $class_name ) || ! class_exists( $class_name ) ) {
			self::force_404();
			return;
		}

		// Re-derived fresh from the model's OWN current config, never
		// baked into the rewrite rule itself -- a field rename (which
		// doesn't change routability at all, see Model_Fields::update()'s
		// own bump_config_version() call for why) never needs a flush to
		// keep resolving correctly, because this always asks "what's the
		// permalink field right now" rather than trusting anything fixed
		// at rule-registration time beyond the class name and root/
		// template id already embedded in the URL itself.
		$field = Model_Fields::permalink_field_for( $class_name );

		if ( ! $field || ! Database_Connection::is_healthy() ) {
			self::force_404();
			return;
		}

		$record = $class_name::where( $field['name'], $slug )->first();

		if ( ! $record ) {
			self::force_404();
			return;
		}

		self::$current_record = $record;
	}

	/**
	 * A direct visit to a model's own Template post -- reported directly
	 * against the earlier Page-based design: "when I preview it the page
	 * is empty. It's populated only in the editor but not on the
	 * front-end." Without this, `$current_record` would simply stay null
	 * for the rest of the request (there's no `gateway_model`/
	 * `gateway_slug` to resolve it from at all), so
	 * `inject_record_context()` below would never set `record` in block
	 * context, and every `gateway/card-field-text`/`-image`/
	 * `related-items` on the page would render nothing -- exactly the
	 * empty page reported.
	 *
	 * Only ever does anything when the post actually being viewed is
	 * itself a currently-routable model's own Template post -- every
	 * other post on the site (there being nothing to preview) is
	 * completely untouched, `$current_record` simply stays null.
	 */
	private static function resolve_preview_record() {
		$page_id = get_queried_object_id();

		if ( ! $page_id ) {
			return;
		}

		$route = null;

		foreach ( self::routable_models() as $candidate ) {
			if ( $candidate['template_id'] === $page_id ) {
				$route = $candidate;
				break;
			}
		}

		if ( ! $route || ! Database_Connection::is_healthy() ) {
			return;
		}

		$preview_record_id = (int) get_post_meta( $page_id, Template_Post_Type::META_PREVIEW_RECORD_ID, true );
		$record             = null;

		if ( $preview_record_id > 0 ) {
			// A deliberately-chosen record, looked up directly rather than
			// re-deriving it from the "first record found" list below --
			// same "a deliberately-searched-for OLDER record would
			// otherwise never resolve" reasoning gateway/single-record's
			// own docblock already gives for the identical lookup. A
			// record since deleted (this id no longer exists) falls
			// through to the same "first record found" default below,
			// exactly like the editor does when its own chosen preview
			// record 404s.
			$record = $route['class']::find( $preview_record_id );
		}

		if ( ! $record ) {
			// "First record found" -- id desc, the exact same default
			// Records_REST_Controller::search_records() (and therefore
			// gateway/single-record/edit.js's own `usePreviewRecord()`)
			// already uses whenever no previewRecordId has been
			// deliberately chosen.
			$record = $route['class']::orderBy( 'id', 'desc' )->first();
		}

		// Still null for a genuinely empty Collection -- left as-is, the
		// same "nothing to preview yet" state the editor's own Notice
		// already treats as normal, not an error. A visitor sees the
		// template with its record-bound blocks simply rendering nothing,
		// same as gateway/card-field-text's own docblock already
		// documents for "record context absent" generally.
		self::$current_record = $record;
	}

	/**
	 * @param array $context Block context being resolved for the current block.
	 * @return array
	 */
	public static function inject_record_context( $context ) {
		if ( self::$current_record ) {
			$context['record']                        = self::$current_record;
			// Populated page-wide from here, not from gateway/single-record's
			// own attributes (it no longer has any) -- this is what lets
			// gateway/card-field-text's/gateway/related-items' own Field/
			// Relationship pickers work anywhere on a Template post, not
			// just nested inside that block's own InnerBlocks.
			$context['gateway/data-cards/sourceType'] = 'collection';
			$context['gateway/data-cards/collection'] = get_class( self::$current_record );
		}

		return $context;
	}

	/**
	 * Blanks out the Template post's own title while viewing a single
	 * -record page -- reported directly against the earlier Page-based
	 * design: a Template is typically named something like "Ticket
	 * Template," which is exactly the kind of internal, site-owner-facing
	 * label that was never meant to be shown to an actual visitor looking
	 * at one real record, yet a theme's own page template (classic
	 * `the_title()` inside the Loop, or a block theme's own `core/post
	 * -title` -- both read through this same `the_title` filter,
	 * `get_the_title()`'s own filter under the hood) would otherwise
	 * print it verbatim. The right way to show a MEANINGFUL heading here
	 * is a `gateway/card-field-text` bound to whichever of the record's
	 * own fields reads as its title -- this only ever removes the
	 * template's own irrelevant placeholder, it never invents a
	 * replacement of its own.
	 *
	 * Filters `the_title` rather than something document-title-specific:
	 * `wp_get_document_title()` itself builds a singular page's own title
	 * part via `single_post_title()`, which calls `get_the_title()` --
	 * the exact same filter -- so this one hook already blanks the
	 * browser tab/SEO title too, not just the on-page heading, with
	 * nothing extra needed.
	 *
	 * Scoped to exactly the Template post's OWN title -- `$post_id` is
	 * compared against `get_queried_object_id()` (the one post this
	 * specific request is actually FOR) rather than blanking every title
	 * unconditionally, so a query loop or a list of other posts placed
	 * somewhere in the same template keeps showing ITS OWN items' real
	 * titles untouched.
	 *
	 * @param string $title   The title WordPress core resolved.
	 * @param int    $post_id Post id the title belongs to.
	 * @return string
	 */
	public static function suppress_template_title( $title, $post_id = 0 ) {
		if ( ! self::$current_record ) {
			return $title;
		}

		if ( (int) $post_id !== (int) get_queried_object_id() ) {
			return $title;
		}

		return '';
	}

	/**
	 * Forces a real 404 -- the same trio WordPress core's own
	 * WP::handle_404() applies, reproduced here since this runs on `wp`,
	 * after core's own 404 handling for THIS request already ran (and
	 * found nothing wrong, since the query genuinely matched a real
	 * post).
	 */
	private static function force_404() {
		global $wp_query;

		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
	}
}
