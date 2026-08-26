/**
 * Shared "find my sibling Data Cards grid, fetch a page of it, swap it into
 * the DOM" logic -- the gateway/data-cards equivalent of shared/wait-for
 * -datatable.js, but fetch-driven instead of DataTables-driven, since
 * gateway/data-cards has no DataTables instance to poll for at all (see
 * gateway/data-cards-body/render.php: the grid, its pager, and its result
 * count are all fully rendered server-side on first paint).
 *
 * Used by gateway/data-cards-search, -page-size, -pagination, -results'
 * own view.js files. Deliberately plain `fetch()`, not `@wordpress/api
 * -fetch`: no view.js in this plugin imports any `@wordpress/*` package
 * (confirmed by grep across blocks/**\/src/view.js) -- `wp-api-fetch`'s
 * root-url/nonce middleware is only ever auto-localized in wp-admin
 * contexts, not guaranteed on a plain front-end page, so every fetch here
 * goes to an absolute REST URL gateway/data-cards-body/render.php already
 * baked into the grid's own `data-rest-url` attribute server-side.
 */

/**
 * @param {HTMLElement} el Any element inside a gateway/data-cards block.
 * @return {HTMLElement|null} The sibling grid's wrapper element, if any.
 */
export function findCardsGridElement( el ) {
	const wrapper = el.closest( '.gateway-data-cards-block' );
	return wrapper ? wrapper.querySelector( '.gateway-data-cards-grid' ) : null;
}

/**
 * Gather every currently-active gateway/card-facet filter under the same
 * grid as `gridEl`, regardless of which specific block triggered a fetch
 * -- the fetch equivalent of DataTables' own multi-column search state
 * (each column's `search()` call independently contributes to the same
 * overall result, without the caller needing to know about the others).
 *
 * Each card-facet's own current DOM value already reflects its default
 * (pre-filled server-side by render.php) unless a visitor changed it, so
 * reading "current value" here naturally captures the full effective
 * filter state -- defaults and live edits alike -- with no separate
 * merge step.
 *
 * `compare` is resolved here, not trusted from the block's own
 * `data-compare` attribute directly: that attribute only ever means
 * something for the "input" UI type (`gateway/card-facet/render.php`'s
 * own docblock -- Select/Checkboxes are always exact matches), and its
 * two values ("contains"/"equals") are this block's own front-end
 * vocabulary, not the SQL-level operators `Facet_Query::apply_facets()`
 * actually expects ('LIKE'/'=') -- translated here, once, rather than
 * asking the server to understand a second vocabulary.
 *
 * @param {HTMLElement} gridEl The grid's wrapper element.
 * @return {Array<{key: string, compare: string, value: (string|string[])}>}
 */
export function collectActiveFacets( gridEl ) {
	const wrapper = gridEl.closest( '.gateway-data-cards-block' );

	if ( ! wrapper ) {
		return [];
	}

	const facets = [];

	wrapper.querySelectorAll( '.gateway-card-facet' ).forEach( ( facetEl ) => {
		const key = facetEl.getAttribute( 'data-facet-key' );
		const uiType = facetEl.getAttribute( 'data-ui-type' );

		if ( ! key ) {
			return;
		}

		let value;

		if ( 'checkboxes' === uiType ) {
			value = Array.from(
				facetEl.querySelectorAll( '.gateway-card-facet__checkbox:checked' )
			).map( ( checkbox ) => checkbox.value );

			if ( ! value.length ) {
				return;
			}
		} else {
			const field = facetEl.querySelector(
				'select' === uiType
					? '.gateway-card-facet__select'
					: '.gateway-card-facet__input'
			);

			value = field ? field.value : '';

			if ( ! value ) {
				return;
			}
		}

		// Select/Checkboxes are always exact matches; only "input" has a
		// real contains-vs-equals choice (see this function's own docblock).
		let compare = '=';

		if ( 'input' === uiType ) {
			compare = 'equals' === facetEl.getAttribute( 'data-compare' ) ? '=' : 'LIKE';
		}

		facets.push( { key, compare, value } );
	} );

	return facets;
}

/**
 * Fetch one page of a Data Cards grid from its REST endpoint.
 *
 * `page` is zero-based throughout (see Data_Cards_Renderer's own
 * docblock) -- matches DataTables' `page.info().page` convention, so
 * shared/pagination-window.js's getPageWindow() needs no base conversion.
 *
 * @param {Object} args
 * @param {HTMLElement} args.gridEl The grid's wrapper element (carries
 *                                  data-rest-url/data-template-id/
 *                                  data-page-size/data-limit).
 * @param {number}      args.page   Zero-based page index to fetch.
 * @param {string}      [args.search] Free-text search term, '' for none.
 * @return {Promise<Object>} `{ html, page, pages, start, end, recordsDisplay, recordsTotal }`.
 * @throws {Error} With a `.status` property on a non-OK response (e.g.
 *                 410 once the server-side template transient has expired
 *                 -- callers should treat that as "reload the page").
 */
export async function fetchCardsPage( { gridEl, page, search = '' } ) {
	const restUrl = gridEl.getAttribute( 'data-rest-url' );
	const templateId = gridEl.getAttribute( 'data-template-id' );
	const pageSize = gridEl.getAttribute( 'data-page-size' ) || '';
	const limit = gridEl.getAttribute( 'data-limit' ) || '0';

	const url = new URL( restUrl, window.location.href );
	url.searchParams.set( 'template_id', templateId || '' );
	url.searchParams.set( 'page', String( page ) );
	url.searchParams.set( 'page_size', pageSize );
	url.searchParams.set( 'limit', limit );

	if ( search ) {
		url.searchParams.set( 'search', search );
	}

	// Gathered fresh on every fetch, not just ones a facet itself
	// triggers -- a Pagination click or Page Size change must not
	// silently drop an active filter (see this function's own callers).
	const facets = collectActiveFacets( gridEl );

	if ( facets.length ) {
		url.searchParams.set( 'facets', JSON.stringify( facets ) );
	}

	const response = await fetch( url.toString(), { credentials: 'omit' } );

	if ( ! response.ok ) {
		const error = new Error(
			`Gateway Data Cards: fetch failed with status ${ response.status }.`
		);
		error.status = response.status;
		throw error;
	}

	return response.json();
}

/**
 * Swap a fetched page's markup into the grid, update its own pager
 * -related data attributes, and notify sibling widgets (Pagination,
 * Results, Page Size) via a plain CustomEvent -- the fetch equivalent of
 * DataTables' own `'draw'` event, since there's no DataTables API instance
 * here to `.on( 'draw', ... )`.
 *
 * @param {HTMLElement} gridEl   The grid's wrapper element.
 * @param {Object}      response The object fetchCardsPage() resolved with.
 * @param {string}      [search] The search term this page was fetched
 *                                with, persisted onto the grid so a later
 *                                page-size/page change doesn't silently
 *                                drop it.
 */
export function renderCardsPage( gridEl, response, search = '' ) {
	// gridEl IS the `<ul>` itself (matching WordPress core's own
	// core/post-template structure -- a single element carrying both the
	// wrapper/layout-support classes and the rendered <li> items, rather
	// than an extra wrapping <div>), so its own innerHTML is the items list.
	gridEl.innerHTML = response.html;

	gridEl.dataset.page = String( response.page );
	gridEl.dataset.pages = String( response.pages );
	gridEl.dataset.start = String( response.start );
	gridEl.dataset.end = String( response.end );
	gridEl.dataset.recordsDisplay = String( response.recordsDisplay );
	gridEl.dataset.recordsTotal = String( response.recordsTotal );
	gridEl.dataset.search = search;

	gridEl.dispatchEvent(
		new CustomEvent( 'gatewaycards:update', { detail: response } )
	);
}

/**
 * Common failure handling for a rejected fetchCardsPage() call: a 410
 * means the server-side template transient expired (the page hosting this
 * grid has been open, unrefreshed, for over an hour -- see
 * Data_Cards_REST_Controller's own docblock) and can never be recovered
 * this way, so the only sane recovery is a full page reload. Anything else
 * (a genuine network/server error) is logged and otherwise swallowed --
 * matches every existing attach-*.js in this plugin, which log rather than
 * throw from inside a DOM event handler.
 *
 * @param {Error} error The rejected fetchCardsPage() error (may carry a `.status`).
 */
export function handleCardsFetchError( error ) {
	if ( 410 === error?.status ) {
		window.location.reload();
		return;
	}

	// eslint-disable-next-line no-console
	console.error( 'Gateway Data Cards: failed to fetch.', error );
}

/**
 * Debounce a function -- shared by gateway/data-cards-search and
 * gateway/card-facet's own view.js (both fire a fetch per keystroke
 * otherwise, unlike gateway/datatable-search's own deliberately-undebounced
 * input, which drives cheap client-side DataTables search instead of a
 * network request -- see each of those two view.js files for the same
 * reasoning, restated where the debounce is actually used).
 *
 * @param {Function} fn   Function to debounce.
 * @param {number}   wait Delay in milliseconds.
 * @return {Function} Debounced wrapper.
 */
export function debounce( fn, wait ) {
	let timeout;
	return ( ...args ) => {
		clearTimeout( timeout );
		timeout = setTimeout( () => fn( ...args ), wait );
	};
}

/**
 * Read the grid's own current pager state back off its data attributes --
 * the fetch equivalent of DataTables' `dataTable.page.info()`, for a
 * sibling widget that just mounted and needs the *already-rendered*
 * (server-side, or from a previous fetch) state rather than fetching again.
 *
 * @param {HTMLElement} gridEl The grid's wrapper element.
 * @return {Object} `{ page, pages, start, end, recordsDisplay, recordsTotal, search }`.
 */
export function readCardsPageInfo( gridEl ) {
	const asInt = ( value ) => parseInt( value || '0', 10 ) || 0;

	return {
		page: asInt( gridEl.dataset.page ),
		pages: asInt( gridEl.dataset.pages ),
		start: asInt( gridEl.dataset.start ),
		end: asInt( gridEl.dataset.end ),
		recordsDisplay: asInt( gridEl.dataset.recordsDisplay ),
		recordsTotal: asInt( gridEl.dataset.recordsTotal ),
		search: gridEl.dataset.search || '',
	};
}
