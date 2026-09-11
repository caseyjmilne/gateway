/**
 * Pure pagination-button-window logic for gateway/data-cards-pagination
 * -- a pure `(current, total) => array` transform, fed a REST fetch
 * response's own `{ page, pages }`, with zero dependency on any
 * particular data source.
 */

// How many page-number buttons to show at once (not counting the always
// -shown first/last page and ellipsis -- see getPageWindow()).
const MAX_VISIBLE_PAGES = 5;

/**
 * Build the list of page entries to render around `current`: every page if
 * there are few enough to just show them all, otherwise a window centered
 * on the current page plus the first/last page, with an ellipsis marker
 * wherever the window doesn't reach them -- the same general shape as most
 * pagination widgets (DataTables' own default paginate control included).
 *
 * @param {number} current Current page index (zero-based).
 * @param {number} total   Total number of pages.
 * @return {Array<number|string>} Page indexes, plus 'ellipsis-start'/'ellipsis-end' markers.
 */
export function getPageWindow( current, total ) {
	if ( total <= 0 ) {
		return [];
	}

	if ( total <= MAX_VISIBLE_PAGES + 2 ) {
		return Array.from( { length: total }, ( _, index ) => index );
	}

	const half = Math.floor( MAX_VISIBLE_PAGES / 2 );
	let start = Math.max( 0, current - half );
	const end = Math.min( total - 1, start + MAX_VISIBLE_PAGES - 1 );
	start = Math.max( 0, end - MAX_VISIBLE_PAGES + 1 );

	const pages = [];

	if ( start > 0 ) {
		pages.push( 0 );

		if ( start > 1 ) {
			pages.push( 'ellipsis-start' );
		}
	}

	for ( let page = start; page <= end; page++ ) {
		pages.push( page );
	}

	if ( end < total - 1 ) {
		if ( end < total - 2 ) {
			pages.push( 'ellipsis-end' );
		}

		pages.push( total - 1 );
	}

	return pages;
}
