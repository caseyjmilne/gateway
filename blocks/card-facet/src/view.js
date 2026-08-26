/**
 * Wires the filter control (input/select/checkboxes) to a fetch against
 * the sibling Data Cards grid's REST endpoint -- the gateway/card-facet
 * equivalent of gateway/facet's own `column(idx).search(...).draw()`
 * call. Doesn't need to build its own request payload: shared/cards.js's
 * fetchCardsPage() gathers every currently-active card-facet under the
 * same grid itself (collectActiveFacets()) on every fetch, so this file
 * only needs to trigger one, the same way gateway/data-cards-search's own
 * view.js does.
 *
 * 300ms debounce for the "input" UI type only (matches gateway/facet's
 * own existing input debounce, and gateway/data-cards-search's reasoning
 * -- a network fetch per keystroke isn't free the way DataTables' client
 * -side search is); Select/Checkboxes fire once per discrete choice, no
 * debounce needed.
 */

import './style.scss';
import {
	findCardsGridElement,
	fetchCardsPage,
	renderCardsPage,
	readCardsPageInfo,
	handleCardsFetchError,
	debounce,
} from '../../shared/cards';

const DEBOUNCE_MS = 300;

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initCardFacet( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const runFetch = () => {
		const { search } = readCardsPageInfo( gridEl );

		fetchCardsPage( { gridEl, page: 0, search } )
			.then( ( response ) => renderCardsPage( gridEl, response, search ) )
			.catch( handleCardsFetchError );
	};

	const input = el.querySelector( '.gateway-card-facet__input' );

	if ( input ) {
		input.addEventListener( 'input', debounce( runFetch, DEBOUNCE_MS ) );
	}

	const select = el.querySelector( '.gateway-card-facet__select' );

	if ( select ) {
		select.addEventListener( 'change', runFetch );
	}

	el.querySelectorAll( '.gateway-card-facet__checkbox' ).forEach( ( checkbox ) => {
		checkbox.addEventListener( 'change', runFetch );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-card-facet' )
		.forEach( initCardFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
