/**
 * Wires this block's own text input to a debounced fetch against the
 * sibling Data Cards grid's REST endpoint -- the gateway/card-facet-text
 * counterpart of gateway/card-facet-has-value's own view.js. Deliberately
 * its own, separate copy of that same wiring rather than a shared import:
 * this block's front-end DOM only ever has one input (no select/checkbox
 * branching to share), and shared/cards.js's collectActiveFacets() is
 * what actually reads this block's own live value back out on every
 * fetch (via its existing generic 'input' branch -- this block emits the
 * exact same `.gateway-card-facet`/`data-ui-type="input"`/`data-compare`/
 * `.gateway-card-facet__input` shape gateway/card-facet's own "input" UI
 * type already does, so that function needed zero changes for this
 * block) -- this file only ever needs to trigger a re-fetch.
 *
 * 300ms debounce, matching gateway/card-facet's own "input" UI type (a
 * network fetch per keystroke isn't free the way DataTables' client-side
 * search is).
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
function initTextFacet( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const input = el.querySelector( '.gateway-card-facet__input' );

	if ( ! input ) {
		return;
	}

	const runFetch = () => {
		const { search } = readCardsPageInfo( gridEl );

		fetchCardsPage( { gridEl, page: 0, search } )
			.then( ( response ) => renderCardsPage( gridEl, response, search ) )
			.catch( handleCardsFetchError );
	};

	input.addEventListener( 'input', debounce( runFetch, DEBOUNCE_MS ) );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-card-facet-text' )
		.forEach( initTextFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
