/**
 * Keeps the "Showing X to Y of Z entries" text in sync with the sibling
 * Data Cards grid -- the gateway/data-cards equivalent of gateway/
 * datatable-results' own `dataTable.on('draw', ...)` wiring, listening
 * for the 'gatewaycards:update' event (dispatched by shared/cards.js's
 * renderCardsPage() on every fetch this block *or any sibling widget*
 * triggers) instead.
 */

import './style.scss';
import { buildInfoText } from '../../shared/results-text';
import { findCardsGridElement, readCardsPageInfo } from '../../shared/cards';

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initResults( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const render = () => {
		el.textContent = buildInfoText( readCardsPageInfo( gridEl ) );
	};

	gridEl.addEventListener( 'gatewaycards:update', render );

	render();
}

function initAll() {
	document
		.querySelectorAll( '.gateway-data-cards-results' )
		.forEach( initResults );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
