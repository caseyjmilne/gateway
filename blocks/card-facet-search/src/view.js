/**
 * Wires the search input to a debounced fetch against the sibling Data
 * Cards grid's REST endpoint -- this plugin's single, shared Data Cards
 * search implementation (see render.php's own docblock for the "why" of
 * the now-removed gateway/data-cards-search this block replaced). 300ms
 * debounce, matching gateway/card-facet's own Input control -- a network
 * fetch per keystroke isn't free.
 *
 * "Facets together" with any other active gateway/card-facet(-has-value/
 * -text) controls needs nothing extra here: fetchCardsPage() already
 * gathers those independently (shared/cards.js's collectActiveFacets())
 * and sends them alongside whatever `search` this input's own value
 * contributes, in the very same request -- see render.php's own docblock.
 */

import './style.scss';
import {
	findCardsGridElement,
	fetchCardsPage,
	renderCardsPage,
	handleCardsFetchError,
	debounce,
} from '../../shared/cards';

const DEBOUNCE_MS = 300;

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initSearch( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const input = el.querySelector( '.gateway-card-facet-search__input' );

	if ( ! input ) {
		return;
	}

	input.value = gridEl.dataset.search || '';

	const runSearch = debounce( () => {
		fetchCardsPage( { gridEl, page: 0, search: input.value } )
			.then( ( response ) => renderCardsPage( gridEl, response, input.value ) )
			.catch( handleCardsFetchError );
	}, DEBOUNCE_MS );

	input.addEventListener( 'input', runSearch );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-card-facet-search' )
		.forEach( initSearch );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
