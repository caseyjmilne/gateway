/**
 * Wires this block's own checkbox to a fetch against the sibling Data
 * Cards grid's REST endpoint -- the gateway/card-facet-has-value
 * counterpart of gateway/card-facet's own view.js. Deliberately its own,
 * separate copy of that same wiring rather than a shared import: this
 * block's own front-end DOM only ever has one checkbox (no input/select/
 * multi-checkbox branching to share), and shared/cards.js's
 * collectActiveFacets() is what actually reads this block's own live
 * state back out on every fetch (via its `hasvalue` branch) -- this file
 * only ever needs to trigger a re-fetch, the same event-listener shape
 * gateway/card-facet's own view.js already establishes for its own
 * checkboxes.
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
function initHasValueFacet( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const checkbox = el.querySelector( '.gateway-card-facet-has-value__checkbox' );

	if ( ! checkbox ) {
		return;
	}

	checkbox.addEventListener( 'change', () => {
		const { search } = readCardsPageInfo( gridEl );

		fetchCardsPage( { gridEl, page: 0, search } )
			.then( ( response ) => renderCardsPage( gridEl, response, search ) )
			.catch( handleCardsFetchError );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-card-facet-has-value' )
		.forEach( initHasValueFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
