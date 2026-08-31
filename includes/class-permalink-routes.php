<?php
/**
 * WordPress routing for single-page records -- the last piece of the
 * plan described in Model_Fields::permalink_field_for()'s own docblock:
 * a model with a fully-configured Permalink field (both `root` and
 * `template_page_id` set) gets one rewrite rule, resolving
 * `/{root}/{slug}` through a real, site-owner-authored WordPress Page
 * acting as that model's own "single record" template.
 *
 * The mechanism, end to end:
 * - `register_rules()` (on `init`) adds `^{root}/([^/]+)/?$ ->
 *   index.php?page_id={template_page_id}&gateway_model={class}&
 *   gateway_slug=$matches[1]` for every currently routable model, then
 *   flushes -- but only when this plugin's own permalink configuration
 *   has actually changed since the last flush (a stored version compare,
 *   mirroring Migration_Runner's own has_run()/latest_ran_version()
 *   versioning rather than, say, a periodic TTL: a stale rewrite rule
 *   means genuinely broken URLs, not tolerably-stale status info, so
 *   this needs to flush exactly on change, not just eventually).
 *   `bump_config_version()` is called by `Model_Fields` itself wherever
 *   a Permalink field's own config actually changes (see that class's
 *   own add()/update()/remove()) -- this class never needs to know WHY
 *   a flush is due, only THAT one is.
 * - `register_query_vars()` (on `query_vars`) makes `gateway_model`/
 *   `gateway_slug` visible to `get_query_var()` at all -- WordPress
 *   ignores any query var a rewrite rule produces that isn't on this
 *   allow-list.
 * - `resolve_record()` (on `wp`, after the main query already ran and
 *   matched the real `page_id`) looks the record up by the model's own
 *   current permalink field/slug. Not found -- or the model/field named
 *   in the URL no longer actually exists or routes at all -- forces a
 *   real 404 even though `page_id` already matched a real page: that
 *   page is only ever a template, never itself the thing being
 *   requested.
 * - `inject_record_context()` (on `render_block_context`, priority 1,
 *   mirroring Data_Cards_Renderer's own identical-shaped filter) sets
 *   `$context['record']` to whatever `resolve_record()` found, for
 *   every block rendered for the rest of this request -- which is all
 *   `blocks/single-record/render.php` (and, transparently, any
 *   `gateway/card-field-text`/`gateway/related-items` inside it) ever
 *   needs to actually render the resolved record's real data.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Permalink_Routes {

	/**
	 * Bumped by Model_Fields every time a Permalink field's own config
	 * changes in a way that could affect routing (added, removed, retyped
	 * into/out of Permalink, or its root/template_page_id settings
	 * edited) -- compared against OPTION_FLUSHED_VERSION below to decide
	 * whether register_rules() needs to actually flush this request.
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
	 * property's own docblock), since a single-record template page only
	 * ever has one record for the whole request.
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
	 * "Routable" means: has a Permalink field at all, AND that field's
	 * own `root` and `template_page_id` are both non-blank -- a `root`
	 * with no template page chosen yet (or vice versa) simply doesn't
	 * route, the deliberately scoped-down phase-1 answer described in
	 * this plugin's own README rather than a bare built-in fallback
	 * template.
	 *
	 * @return array<int,array{class:string,field:string,root:string,template_page_id:int}>
	 */
	private static function routable_models() {
		$routes = array();

		foreach ( Model_Registry::all() as $class_name ) {
			$field = Model_Fields::permalink_field_for( $class_name );

			if ( ! $field ) {
				continue;
			}

			$settings         = $field['settings'] ?? array();
			$root             = is_array( $settings ) ? (string) ( $settings['root'] ?? '' ) : '';
			$template_page_id = is_array( $settings ) ? (int) ( $settings['template_page_id'] ?? 0 ) : 0;

			if ( '' === $root || $template_page_id <= 0 ) {
				continue;
			}

			$routes[] = array(
				'class'             => $class_name,
				'field'             => $field['name'],
				'root'              => $root,
				'template_page_id'  => $template_page_id,
			);
		}

		return $routes;
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
				'index.php?page_id=' . $route['template_page_id']
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
	 * the main query has already run and matched the real template
	 * `page_id` -- and forces a genuine 404 the moment anything about
	 * that resolution doesn't check out, exactly as if the page itself
	 * didn't exist. `page_id` matching is never enough on its own: that
	 * page is only ever a template, so a slug this model doesn't
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
		// template_page_id already embedded in the URL itself.
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
	 * @param array $context Block context being resolved for the current block.
	 * @return array
	 */
	public static function inject_record_context( $context ) {
		if ( self::$current_record ) {
			$context['record'] = self::$current_record;
		}

		return $context;
	}

	/**
	 * Forces a real 404 -- the same trio WordPress core's own
	 * WP::handle_404() applies, reproduced here since this runs on `wp`,
	 * after core's own 404 handling for THIS request already ran (and
	 * found nothing wrong, since `page_id` genuinely matched a real
	 * page).
	 */
	private static function force_404() {
		global $wp_query;

		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
	}
}
