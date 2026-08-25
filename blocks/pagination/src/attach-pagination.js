/**
 * Wires an already-rendered pagination control's DOM to a live DataTable
 * instance -- shared between the front end (view.js) and the editor's own
 * live preview (hooks/use-editor-preview.js), so the exact same button
 * -building logic drives both, rather than the editor showing a fixed,
 * fake page count that has nothing to do with the table it's sitting next
 * to.
 */

import { hideNativeDataTableWidget } from '../../shared/wait-for-datatable';

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

/**
 * @param {HTMLElement}      el        The pagination control's own wrapper element (a `<nav class="gateway-pagination">`).
 * @param {HTMLTableElement} table     The sibling `<table>` -- only needed to find and remove DataTables' own default paging widget.
 * @param {Object}           dataTable The live DataTables API instance.
 * @return {Function} Cleanup -- removes every listener this attached
 *                     (including DataTables' own `draw` one), safe to call
 *                     more than once. The caller is responsible for calling
 *                     it before re-attaching to a *different* instance
 *                     (e.g. one DataTables recreated after a settings
 *                     change) -- attaching without it would leave a stale
 *                     `draw` listener on the old, discarded instance.
 */
export function attachPagination( el, table, dataTable ) {
	const prevButton = el.querySelector( '.gateway-pagination__prev' );
	const nextButton = el.querySelector( '.gateway-pagination__next' );
	const pagesEl = el.querySelector( '.gateway-pagination__pages' );

	if ( ! prevButton || ! nextButton || ! pagesEl ) {
		return () => {};
	}

	// This block is a full replacement for DataTables' own default paging
	// control, not an addition alongside it.
	hideNativeDataTableWidget( table, 'dt-paging' );

	const render = () => {
		const info = dataTable.page.info();

		prevButton.disabled = info.page <= 0;
		nextButton.disabled = info.page >= info.pages - 1;

		pagesEl.textContent = '';

		getPageWindow( info.page, info.pages ).forEach( ( entry ) => {
			if ( 'ellipsis-start' === entry || 'ellipsis-end' === entry ) {
				const ellipsis = el.ownerDocument.createElement( 'span' );
				ellipsis.className = 'gateway-pagination__ellipsis';
				ellipsis.setAttribute( 'aria-hidden', 'true' );
				ellipsis.textContent = '…';
				pagesEl.appendChild( ellipsis );
				return;
			}

			const button = el.ownerDocument.createElement( 'button' );
			button.type = 'button';
			button.className = 'gateway-pagination__page';
			button.textContent = String( entry + 1 );
			button.dataset.page = String( entry );

			if ( entry === info.page ) {
				button.classList.add( 'is-current' );
				button.setAttribute( 'aria-current', 'page' );
			}

			pagesEl.appendChild( button );
		} );
	};

	const onPrevClick = () => dataTable.page( 'previous' ).draw( 'page' );
	const onNextClick = () => dataTable.page( 'next' ).draw( 'page' );

	// Delegated: page-number buttons are rebuilt on every draw, so a
	// listener bound to any one of them wouldn't survive a redraw.
	const onPagesClick = ( event ) => {
		const button = event.target.closest( '.gateway-pagination__page' );

		if ( ! button ) {
			return;
		}

		dataTable.page( Number( button.dataset.page ) ).draw( 'page' );
	};

	// Re-render on every draw, not just page changes: a gateway/facet
	// filter can change the total record/page count without this block
	// itself doing anything, and the button states (which page numbers
	// exist, which is current/disabled) need to stay accurate either way.
	const onDraw = () => {
		try {
			render();
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Pagination: failed to render.', error );
		}
	};

	prevButton.addEventListener( 'click', onPrevClick );
	nextButton.addEventListener( 'click', onNextClick );
	pagesEl.addEventListener( 'click', onPagesClick );
	dataTable.on( 'draw', onDraw );

	try {
		render();
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Pagination: failed to render.', error );
	}

	return () => {
		prevButton.removeEventListener( 'click', onPrevClick );
		nextButton.removeEventListener( 'click', onNextClick );
		pagesEl.removeEventListener( 'click', onPagesClick );
		dataTable.off( 'draw', onDraw );
	};
}
