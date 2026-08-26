/**
 * Wires the page-size <select> to a fetch against the sibling Data Cards
 * grid's REST endpoint -- the gateway/data-cards equivalent of gateway/
 * datatable-page-size's `dataTable.page.len(value).draw()` call.
 *
 * No debounce needed: a `change` event fires once per discrete choice, not
 * per keystroke (same reasoning as gateway/datatable-page-size's own
 * view.js). Changing page size resets to page 0 -- the same simplification
 * gateway/data-cards-search's search reset uses, rather than trying to
 * preserve scroll position across a page-size change.
 */

import './style.scss';
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
function initPageSize( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const select = el.querySelector( '.gateway-data-cards-page-size__select' );

	if ( ! select ) {
		return;
	}

	select.addEventListener( 'change', () => {
		gridEl.dataset.pageSize = select.value;

		const { search } = readCardsPageInfo( gridEl );

		fetchCardsPage( { gridEl, page: 0, search } )
			.then( ( response ) => renderCardsPage( gridEl, response, search ) )
			.catch( handleCardsFetchError );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-data-cards-page-size' )
		.forEach( initPageSize );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
