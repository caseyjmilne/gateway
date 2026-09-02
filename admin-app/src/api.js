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
 */
const config =
	typeof window !== 'undefined' && window.GatewayAdmin
		? window.GatewayAdmin
		: { apiUrl: '', nonce: '', oembedProxyUrl: '', wpApiUrl: '', homeUrl: '' };

// The site's own front-end root (e.g. "https://example.com/"), set by
// Admin_Page::enqueue_assets(). The only current reader is
// admin-app/src/utils/permalink.js, which builds a record's real
// front-end URL from this plus its model's own configured Permalink
// Root -- exported plainly rather than through a function, the same
// "just a config value" treatment `config` itself already gets internally.
export const HOME_URL = config.homeUrl;

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
		const message =
			data && data.message
				? data.message
				: `Request failed (${ response.status }).`;
		throw new Error( message );
	}

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
 * Searches WordPress's own core Pages via `GET /wp-json/wp/v2/pages` --
 * used by `PermalinkEditor.jsx`'s own Template Page picker. A different
 * REST namespace again (`wp/v2`, not this plugin's own `gateway/v1`, and
 * not the oEmbed proxy either), so it goes through `config.wpApiUrl`
 * (the bare REST root) the same way `fetchOembedPreview()` above goes
 * through its own separate `oembedProxyUrl` rather than `apiFetch()`.
 *
 * `search`, when given, is passed straight through as `wp/v2`'s own
 * `search` query param (a plain substring match against title/content --
 * core's own behavior, nothing this plugin implements). Results are
 * capped at a generous `per_page` -- a full, unpaginated picker isn't
 * worth building for what's expected to be a short list of candidate
 * template pages.
 *
 * @param {string} search Optional title search string.
 * @return {Promise<Array<{id: number, title: string}>>}
 */
export async function fetchWpPages( search = '' ) {
	const params = new URLSearchParams( {
		per_page: '50',
		status: 'any',
		_fields: 'id,title',
	} );
	if ( search.trim() ) {
		params.set( 'search', search.trim() );
	}

	const response = await fetch(
		`${ config.wpApiUrl }wp/v2/pages?${ params.toString() }`,
		{ headers: { 'X-WP-Nonce': config.nonce } }
	);

	if ( ! response.ok ) {
		throw new Error( `Could not load pages (${ response.status }).` );
	}

	const pages = await response.json();
	return pages.map( ( page ) => ( {
		id: page.id,
		title: page.title && page.title.rendered ? page.title.rendered : `(#${ page.id })`,
	} ) );
}

/**
 * `LinkPicker.jsx`'s own "Or link to existing content" list -- copying
 * ACF's own Link field, per a direct request. Same `wp/v2` REST
 * namespace as `fetchWpPages()` above, just querying BOTH `wp/v2/pages`
 * and `wp/v2/posts` in parallel and merging the results, since ACF's own
 * modal offers both post types together in one list, distinguished only
 * by `type` (`PermalinkEditor`'s own picker only ever needed Pages, one
 * model's own single-record template page, so `fetchWpPages()` itself
 * stays narrower rather than gaining a post-type param nothing else uses
 * yet). `status: 'publish'` -- only content a site visitor could actually
 * land on is worth offering to link to, unlike `fetchWpPages()`'s own
 * `status: 'any'` (a Template Page picker is an admin-only concern,
 * where a still-draft page is a perfectly reasonable pick).
 *
 * A request search's own failure is swallowed to an empty array for
 * that one post type rather than thrown -- one endpoint erroring (a
 * custom post-type-removed `posts` route on some unusual install, e.g.)
 * shouldn't block the other's own results from showing.
 *
 * Sorted newest-first and capped at a generous but bounded count -- this
 * is a quick "recent items" picker, not a fully paginated browse of
 * every page/post a large site has, the same "short list of candidates"
 * scope `fetchWpPages()`'s own docblock already accepts.
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
