/**
 * Wires the Previous/Next/page-number buttons to fetches against the
 * sibling Data Cards grid's REST endpoint -- the gateway/data-cards
 * equivalent of gateway/pagination's `dataTable.page(n).draw('page')`
 * calls, and getPageWindow()-based button rebuilding, fed a REST fetch
 * response's `{ page, pages }` instead of `dataTable.page.info()`.
 *
 * Listens for the 'gatewaycards:update' event (dispatched by shared/
 * cards.js's renderCardsPage(), on every fetch this block *or any
 * sibling widget* triggers) to rebuild its own buttons -- the fetch
 * equivalent of gateway/pagination's own `dataTable.on('draw', ...)`,
 * since a page-size change or search from a DIFFERENT block can also
 * change the total page count this block needs to reflect.
 */

import './style.scss';
import { getPageWindow } from '../../shared/pagination-window';
import {
	findCardsGridElement,
	fetchCardsPage,
	renderCardsPage,
	readCardsPageInfo,
	handleCardsFetchError,
} from '../../shared/cards';

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initPagination( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const prevButton = el.querySelector( '.gateway-data-cards-pagination__prev' );
	const nextButton = el.querySelector( '.gateway-data-cards-pagination__next' );
	const pagesEl = el.querySelector( '.gateway-data-cards-pagination__pages' );

	if ( ! prevButton || ! nextButton || ! pagesEl ) {
		return;
	}

	const render = () => {
		const { page, pages } = readCardsPageInfo( gridEl );

		prevButton.disabled = page <= 0;
		nextButton.disabled = page >= pages - 1;

		pagesEl.textContent = '';

		getPageWindow( page, pages ).forEach( ( entry ) => {
			if ( 'ellipsis-start' === entry || 'ellipsis-end' === entry ) {
				const ellipsis = el.ownerDocument.createElement( 'span' );
				ellipsis.className = 'gateway-data-cards-pagination__ellipsis';
				ellipsis.setAttribute( 'aria-hidden', 'true' );
				ellipsis.textContent = '…';
				pagesEl.appendChild( ellipsis );
				return;
			}

			const button = el.ownerDocument.createElement( 'button' );
			button.type = 'button';
			button.className = 'gateway-data-cards-pagination__page';
			button.textContent = String( entry + 1 );
			button.dataset.page = String( entry );

			if ( entry === page ) {
				button.classList.add( 'is-current' );
				button.setAttribute( 'aria-current', 'page' );
			}

			pagesEl.appendChild( button );
		} );
	};

	const goToPage = ( page ) => {
		const { search } = readCardsPageInfo( gridEl );

		fetchCardsPage( { gridEl, page, search } )
			.then( ( response ) => renderCardsPage( gridEl, response, search ) )
			.catch( handleCardsFetchError );
	};

	prevButton.addEventListener( 'click', () => {
		goToPage( readCardsPageInfo( gridEl ).page - 1 );
	} );

	nextButton.addEventListener( 'click', () => {
		goToPage( readCardsPageInfo( gridEl ).page + 1 );
	} );

	// Delegated: page-number buttons are rebuilt on every render(), so a
	// listener bound to any one of them wouldn't survive a rebuild.
	pagesEl.addEventListener( 'click', ( event ) => {
		const button = event.target.closest( '.gateway-data-cards-pagination__page' );

		if ( ! button ) {
			return;
		}

		goToPage( Number( button.dataset.page ) );
	} );

	gridEl.addEventListener( 'gatewaycards:update', render );

	render();
}

function initAll() {
	document
		.querySelectorAll( '.gateway-data-cards-pagination' )
		.forEach( initPagination );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
