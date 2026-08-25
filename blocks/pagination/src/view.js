/**
 * Front-end entry point for the gateway/pagination block: finds the sibling
 * datatable's DataTable instance and wires Previous/Next/page-number
 * controls to its `page()` API, keeping them in sync via the `draw` event
 * -- fired after every redraw, including page changes and gateway/facet
 * -driven filtering, either of which can change the total page count.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's docblock for why (double-bundling that
 * library resets its own instance registry and breaks the datatable
 * block's idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 */

import './style.scss';
import {
	findDataTableElement,
	waitForDataTable,
} from '../../shared/wait-for-datatable';

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
function getPageWindow( current, total ) {
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
 * @param {HTMLElement} el The pagination block's wrapper element.
 */
function initPagination( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		const prevButton = el.querySelector( '.gateway-pagination__prev' );
		const nextButton = el.querySelector( '.gateway-pagination__next' );
		const pagesEl = el.querySelector( '.gateway-pagination__pages' );

		if ( ! prevButton || ! nextButton || ! pagesEl ) {
			return;
		}

		const render = () => {
			const info = dataTable.page.info();

			prevButton.disabled = info.page <= 0;
			nextButton.disabled = info.page >= info.pages - 1;

			pagesEl.textContent = '';

			getPageWindow( info.page, info.pages ).forEach( ( entry ) => {
				if ( 'ellipsis-start' === entry || 'ellipsis-end' === entry ) {
					const ellipsis = document.createElement( 'span' );
					ellipsis.className = 'gateway-pagination__ellipsis';
					ellipsis.setAttribute( 'aria-hidden', 'true' );
					ellipsis.textContent = '…';
					pagesEl.appendChild( ellipsis );
					return;
				}

				const button = document.createElement( 'button' );
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

		prevButton.addEventListener( 'click', () => {
			dataTable.page( 'previous' ).draw( 'page' );
		} );

		nextButton.addEventListener( 'click', () => {
			dataTable.page( 'next' ).draw( 'page' );
		} );

		// Delegated: page-number buttons are rebuilt on every draw, so a
		// listener bound to any one of them wouldn't survive a redraw.
		pagesEl.addEventListener( 'click', ( event ) => {
			const button = event.target.closest( '.gateway-pagination__page' );

			if ( ! button ) {
				return;
			}

			dataTable.page( Number( button.dataset.page ) ).draw( 'page' );
		} );

		// Re-render on every draw, not just page changes: a gateway/facet
		// filter can change the total record/page count without this block
		// itself doing anything, and the button states (which page numbers
		// exist, which is current/disabled) need to stay accurate either way.
		dataTable.on( 'draw', render );
		render();
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-pagination' )
		.forEach( initPagination );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
