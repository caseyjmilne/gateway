/**
 * Small fetch wrapper for the gateway/v1 REST namespace.
 *
 * Reads window.GatewayAdmin, which Admin_Page::enqueue_assets() sets up via
 * wp_localize_script() before this bundle runs -- apiUrl is the namespace
 * root (e.g. https://example.com/wp-json/gateway/v1), nonce authenticates
 * the request as the logged-in admin viewing the page (same mechanism the
 * block editor's own REST calls use). oembedProxyUrl is a second, unrelated
 * REST route's own full URL -- see fetchOembedPreview() below for why it
 * doesn't just live under apiUrl.
 *
 * Falls back to empty values (rather than throwing at import time) so
 * `npm run dev` -- where window.GatewayAdmin is never set -- can still load
 * the app; calls will simply fail with a clear "Request failed" error
 * instead of a broken page.
 *
 * `nonce` in particular can go stale well before this page is ever
 * reloaded -- see `Admin_Page::enqueue_assets()`'s own docblock for the
 * Heartbeat-based fix that keeps `window.GatewayAdmin.nonce` fresh in
 * place for as long as this tab stays open, and `apiFetch()`'s own
 * `rest_cookie_invalid_nonce` branch below for the one-time-reload
 * safety net underneath that fix.
 */
const config =
	typeof window !== 'undefined' && window.GatewayAdmin
		? window.GatewayAdmin
		: { apiUrl: '', nonce: '', oembedProxyUrl: '', wpApiUrl: '', wpAdminUrl: '', homeUrl: '' };

// The site's own front-end root (e.g. "https://example.com/"), set by
// Admin_Page::enqueue_assets(). The only current reader is
// admin-app/src/utils/permalink.js, which builds a record's real
// front-end URL from this plus its model's own configured Permalink
// Root -- exported plainly rather than through a function, the same
// "just a config value" treatment `config` itself already gets internally.
export const HOME_URL = config.homeUrl;

// The bare wp-admin root, set by Admin_Page::enqueue_assets(). The only
// current reader is `PermalinkEditor.jsx`, which builds a direct link to
// a Model's own Template post (`post.php?post={id}&action=edit`, or
// `post-new.php?post_type=gateway_templates` when none exists yet) --
// same "just a config value" export as HOME_URL above.
export const WP_ADMIN_URL = config.wpAdminUrl;

// Guards the one-time automatic reload below against looping forever --
// see apiFetch()'s own "rest_cookie_invalid_nonce" branch for why a
// SINGLE reload is the right response to that specific error, but a
// second one arriving right after (a genuinely broken login state, not
// just a stale nonce) must surface as a real error instead of silently
// reloading over and over. Cleared the moment any request actually
// succeeds, so a LATER, unrelated staleness (hours or days from now, in
// this same tab) still gets its own one-shot reload rather than being
// permanently blocked by a flag from earlier in the session.
const NONCE_RELOAD_KEY = 'gatewayNonceReloaded';

export async function apiFetch( path, options = {} ) {
	const response = await fetch( `${ config.apiUrl }${ path }`, {
		...options,
		headers: {
			'Content-Type': 'application/json',
			'X-WP-Nonce': config.nonce,
			...( options.headers || {} ),
		},
	} );

	let data = null;
	try {
		data = await response.json();
	} catch {
		// Non-JSON body (e.g. a fatal error page) -- fall through, message
		// below covers it.
	}

	if ( ! response.ok ) {
		// WordPress core's own `rest_cookie_invalid_nonce` -- thrown
		// whenever this request's own `X-WP-Nonce` header fails
		// `wp_verify_nonce()`, entirely independent of whether the
		// user's actual login session is still valid (it almost always
		// still is -- see Admin_Page::enqueue_assets()'s own docblock
		// for the full "why," and the Heartbeat-based fix that should
		// already prevent this in the first place). Per a direct
		// report ("Sometimes we randomly get 'Cookie check failed'...
		// User is still logged in and the error is not expected"), this
		// is a safety net for whatever residual case still slips past
		// that fix (a blocked/failed Heartbeat tick, say): a plain
		// reload -- this app is a HashRouter SPA, so the current route
		// survives it -- fetches a brand new nonce via a normal PHP
		// page render and picks up exactly where the user left off,
		// with no confusing raw error message ever shown at all.
		if (
			data &&
			'rest_cookie_invalid_nonce' === data.code &&
			! window.sessionStorage.getItem( NONCE_RELOAD_KEY )
		) {
			window.sessionStorage.setItem( NONCE_RELOAD_KEY, '1' );
			window.location.reload();
			// The reload above is already in flight -- this promise
			// simply never settles rather than surfacing an error the
			// page is about to navigate away from regardless.
			return new Promise( () => {} );
		}

		const message =
			data && data.message
				? data.message
				: `Request failed (${ response.status }).`;
		throw new Error( message );
	}

	window.sessionStorage.removeItem( NONCE_RELOAD_KEY );

	return data;
}

/**
 * Fetches a live embed preview from WordPress's own oEmbed proxy route
 * (`GET /wp-json/oembed/1.0/proxy`) -- the exact one the block editor's
 * own Embed block and ACF's own oEmbed field both use. A different REST
 * namespace entirely from `apiFetch()`'s own `gateway/v1` (`oembed/1.0`,
 * a WP core route that exists regardless of this plugin), so it needs
 * its own full URL (`window.GatewayAdmin.oembedProxyUrl`, set by
 * `Admin_Page::enqueue_assets()`) rather than going through `apiFetch()`.
 *
 * @param {string}      url       The URL to embed.
 * @param {number|null} maxwidth  Optional max width in px.
 * @param {number|null} maxheight Optional max height in px.
 * @return {Promise<object>} The oEmbed response (`.html` is the markup
 *                             to render; shape otherwise varies by
 *                             provider).
 */
export async function fetchOembedPreview( url, maxwidth, maxheight ) {
	const params = new URLSearchParams( { url } );
	if ( maxwidth ) {
		params.set( 'maxwidth', maxwidth );
	}
	if ( maxheight ) {
		params.set( 'maxheight', maxheight );
	}

	const response = await fetch(
		`${ config.oembedProxyUrl }?${ params.toString() }`,
		{ headers: { 'X-WP-Nonce': config.nonce } }
	);

	if ( ! response.ok ) {
		throw new Error( `No embed found (${ response.status }).` );
	}

	return response.json();
}

/**
 * `LinkPicker.jsx`'s own "Or link to existing content" list -- copying
 * ACF's own Link field, per a direct request. Goes through
 * `config.wpApiUrl` (the bare REST root) the same way `fetchOembedPreview()`
 * above goes through its own separate `oembedProxyUrl` rather than
 * `apiFetch()` -- a different REST namespace again (`wp/v2`, not this
 * plugin's own `gateway/v1`) -- querying BOTH `wp/v2/pages` and
 * `wp/v2/posts` in parallel and merging the results, since ACF's own
 * modal offers both post types together in one list, distinguished only
 * by `type`. `status: 'publish'` -- only content a site visitor could
 * actually land on is worth offering to link to.
 *
 * A request search's own failure is swallowed to an empty array for
 * that one post type rather than thrown -- one endpoint erroring (a
 * custom post-type-removed `posts` route on some unusual install, e.g.)
 * shouldn't block the other's own results from showing.
 *
 * Sorted newest-first and capped at a generous but bounded count -- this
 * is a quick "recent items" picker, not a fully paginated browse of
 * every page/post a large site has.
 *
 * @param {string} search Optional title search string.
 * @return {Promise<Array<{id: number, type: 'page'|'post', title: string, link: string, date: string}>>}
 */
export async function searchLinkableContent( search = '' ) {
	const params = new URLSearchParams( {
		per_page: '20',
		status: 'publish',
		orderby: 'date',
		order: 'desc',
		_fields: 'id,type,title,link,date',
	} );
	if ( search.trim() ) {
		params.set( 'search', search.trim() );
	}

	const results = await Promise.all(
		[ 'pages', 'posts' ].map( async ( endpoint ) => {
			try {
				const response = await fetch(
					`${ config.wpApiUrl }wp/v2/${ endpoint }?${ params.toString() }`,
					{ headers: { 'X-WP-Nonce': config.nonce } }
				);

				if ( ! response.ok ) {
					return [];
				}

				return await response.json();
			} catch {
				return [];
			}
		} )
	);

	return results
		.flat()
		.map( ( item ) => ( {
			id: item.id,
			type: item.type,
			title: item.title && item.title.rendered ? item.title.rendered : `(#${ item.id })`,
			link: item.link,
			date: item.date,
		} ) )
		.sort( ( a, b ) => new Date( b.date ) - new Date( a.date ) )
		.slice( 0, 20 );
}

/**
 * This site's own PUBLIC post types, via `GET /gateway/v1/post-types` --
 * `usePostTypes.js`'s own fetch, what `FieldEditor.jsx`'s own "Filter by
 * Post Type" setting builds its option list from.
 *
 * This used to call WordPress core's own `GET wp/v2/types` directly --
 * two real bugs, both reported directly. First: "post types and
 * taxonomies return no matches, the list is empty" -- WordPress's own
 * `_fields` filtering (`_rest_filter_response_fields()`) only recurses
 * into a NUMERICALLY-indexed collection (`wp_is_numeric_array()`), but
 * `/wp/v2/types`'s own response is keyed by STRING slug
 * (`{ post: {...}, page: {...}, ... }`), so `_fields=slug,name` mistook
 * the whole response for a single item and filtered ITS OWN top-level
 * keys ('post', 'page', ...) against `slug,name`, silently stripping
 * every entry down to `{}`. Dropping `_fields` (and the `context=edit`
 * it no longer needed either) fixed that -- but exposed a second,
 * separate bug: "post types should be public only in this case Post,
 * Page, Media instead we are getting also system CPT's." `wp/v2/types`
 * only ever filters by `show_in_rest`, a WHOLLY DIFFERENT registration
 * flag from `public` -- WordPress's own internal editor-only types
 * (`wp_block`, `wp_template`, `wp_template_part`, `wp_global_styles`,
 * `wp_navigation`, `wp_font_family`/`wp_font_face`, ...) all have
 * `show_in_rest: true` (the editor needs a REST route for them) but
 * `public: false`, so they showed up here right alongside genuinely
 * public content types. `Post_REST_Controller::list_post_types()`
 * fixes this at the root by going through real WordPress core
 * (`get_post_types( array( 'public' => true ) )`, the exact same filter
 * `search_posts()`'s own unrestricted default already uses) instead of
 * `wp/v2/types`'s own listing -- `'attachment'` ("Media") is
 * deliberately included here despite being excluded from that
 * unrestricted default, since this is the OPTIONS list for what Filter
 * by Post Type can be configured to, not a restriction on what an
 * unconfigured field searches by default.
 *
 * @return {Promise<Array<{value: string, label: string}>>}
 */
export async function fetchPostTypes() {
	return apiFetch( '/post-types' );
}

/**
 * This site's own PUBLIC taxonomies, via `GET /gateway/v1/taxonomies` --
 * `useTaxonomies.js`'s own fetch, what `FieldEditor.jsx`'s own "Filter
 * by Taxonomy" setting builds its option list from. Same
 * `wp/v2/taxonomies`-only-filters-by-`show_in_rest`-not-`public` bug
 * `fetchPostTypes()` above already had (WordPress's own internal
 * taxonomies like `wp_theme`/`wp_template_part_area`/
 * `wp_pattern_category` would otherwise show up here too) -- see that
 * function's own docblock for the full story, and
 * `Post_REST_Controller::list_taxonomies()` for the fix
 * (`get_taxonomies( array( 'public' => true ) )`).
 *
 * @return {Promise<Array<{value: string, label: string}>>}
 */
export async function fetchTaxonomies() {
	return apiFetch( '/taxonomies' );
}

/**
 * `PostObjectPicker.jsx`'s own live search -- `GET /gateway/v1/posts/search`,
 * this plugin's own route (not `wp/v2` directly, unlike `searchLinkableContent()`
 * above -- see `Post_REST_Controller`'s own docblock for why an arbitrary
 * taxonomy filter needs a real server-side `WP_Query`, not something a
 * client-side call against core's own per-post-type routes could
 * replicate generically). `filterSettings` is the field's own
 * `settings` object -- `filter_post_types`/`filter_post_statuses`/
 * `filter_taxonomies`, each already a plain array or absent -- joined
 * into comma-separated params here, exactly what `Post_REST_Controller::split_param()`
 * expects back apart.
 *
 * @param {object}   filterSettings   The field's own `settings`.
 * @param {string}   query            Live search text.
 * @param {number[]} excludeIds       Already-selected post ids to leave out.
 * @return {Promise<Array<{id: number, label: string, type: string}>>}
 */
export async function searchPosts( filterSettings, query, excludeIds ) {
	const params = new URLSearchParams();

	if ( query ) {
		params.set( 'q', query );
	}
	if ( filterSettings?.filter_post_types?.length ) {
		params.set( 'post_types', filterSettings.filter_post_types.join( ',' ) );
	}
	if ( filterSettings?.filter_post_statuses?.length ) {
		params.set( 'post_statuses', filterSettings.filter_post_statuses.join( ',' ) );
	}
	if ( filterSettings?.filter_taxonomies?.length ) {
		params.set( 'taxonomies', filterSettings.filter_taxonomies.join( ',' ) );
	}
	if ( excludeIds?.length ) {
		params.set( 'exclude', excludeIds.join( ',' ) );
	}

	return apiFetch( `/posts/search?${ params.toString() }` );
}

/**
 * `PostObjectPicker.jsx`'s own preview for a bare post id (`return_format`
 * `'id'`, the same gap `Media_REST_Controller::get_media()`/
 * `User_REST_Controller::get_user()` already fill for their own types) --
 * `GET /gateway/v1/posts/<id>`.
 *
 * @param {number} id WP post id.
 * @return {Promise<{id: number, label: string, type: string}>}
 */
export async function fetchPostOption( id ) {
	return apiFetch( `/posts/${ id }` );
}

/**
 * `PageLinkPicker.jsx`'s own live search -- `GET /gateway/v1/page-links/search`,
 * `Page_Link_Field_Type`'s own close sibling of `searchPosts()` above --
 * same four filter params, but `excludeUrls` (already-selected URLs, not
 * ids -- this field stores URLs, see that type's own docblock) and one
 * more: `filterSettings.allow_archive_urls`, sent through as `'1'`/`'0'`
 * so `Post_REST_Controller::search_page_links()` knows whether to also
 * offer each allowed post type's own archive URL.
 *
 * @param {object}   filterSettings The field's own `settings`.
 * @param {string}   query          Live search text.
 * @param {string[]} excludeUrls    Already-selected URLs to leave out.
 * @return {Promise<Array<{value: string, label: string, group: string|null}>>}
 */
export async function searchPageLinks( filterSettings, query, excludeUrls ) {
	const params = new URLSearchParams();

	if ( query ) {
		params.set( 'q', query );
	}
	if ( filterSettings?.filter_post_types?.length ) {
		params.set( 'post_types', filterSettings.filter_post_types.join( ',' ) );
	}
	if ( filterSettings?.filter_post_statuses?.length ) {
		params.set( 'post_statuses', filterSettings.filter_post_statuses.join( ',' ) );
	}
	if ( filterSettings?.filter_taxonomies?.length ) {
		params.set( 'taxonomies', filterSettings.filter_taxonomies.join( ',' ) );
	}
	if ( excludeUrls?.length ) {
		params.set( 'exclude', excludeUrls.join( ',' ) );
	}
	if ( filterSettings?.allow_archive_urls ) {
		params.set( 'allow_archive_urls', '1' );
	}

	return apiFetch( `/page-links/search?${ params.toString() }` );
}

/**
 * `PageLinkPicker.jsx`'s own preview for an already-stored URL -- there's
 * no id to look up BY here at all (unlike `fetchPostOption()` above),
 * only the URL itself -- `GET /gateway/v1/page-links/resolve`.
 *
 * @param {string} url The already-stored URL.
 * @return {Promise<{value: string, label: string, group: string|null}>}
 */
export async function resolvePageLink( url ) {
	return apiFetch( `/page-links/resolve?url=${ encodeURIComponent( url ) }` );
}

/**
 * `FieldEditor.jsx`'s own Filter by Role option list -- `GET /gateway/v1/roles`
 * (`User_REST_Controller::list_roles()`), this site's own registered WP
 * roles -- `usePostTypes()`'s own close cousin, just for User's own new
 * Filter by Role setting instead of Post Object's Filter by Post Type.
 *
 * @return {Promise<Array<{value: string, label: string}>>}
 */
export async function fetchRoles() {
	return apiFetch( '/roles' );
}
