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
		: { apiUrl: '', nonce: '', oembedProxyUrl: '' };

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
