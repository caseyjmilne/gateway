/**
 * Small fetch wrapper for the gateway/v1 REST namespace.
 *
 * Reads window.GatewayAdmin, which Admin_Page::enqueue_assets() sets up via
 * wp_localize_script() before this bundle runs -- apiUrl is the namespace
 * root (e.g. https://example.com/wp-json/gateway/v1), nonce authenticates
 * the request as the logged-in admin viewing the page (same mechanism the
 * block editor's own REST calls use).
 *
 * Falls back to empty values (rather than throwing at import time) so
 * `npm run dev` -- where window.GatewayAdmin is never set -- can still load
 * the app; calls will simply fail with a clear "Request failed" error
 * instead of a broken page.
 */
const config =
	typeof window !== 'undefined' && window.GatewayAdmin
		? window.GatewayAdmin
		: { apiUrl: '', nonce: '' };

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
