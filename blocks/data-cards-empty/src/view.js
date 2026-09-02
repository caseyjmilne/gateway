/**
 * Keeps this block's own visibility in sync with the sibling Data Cards
 * grid -- listening for the 'gatewaycards:update' event (dispatched by
 * shared/cards.js's renderCardsPage() on every fetch a Search/Facet/
 * Pagination/Page Size change triggers), same wiring gateway/
 * data-cards-results' own view.js already uses to keep ITS text in sync.
 *
 * render.php already computed the correct initial hidden/visible state
 * server-side (see that file's own docblock) -- calling render() once
 * more here on mount is a defensive no-op in the common case, not a fix
 * for a real gap, the same "reconcile once on mount, then again on every
 * update" shape gateway/data-cards-results' own initResults() already
 * follows.
 */

import './style.scss';
import { findCardsGridElement, readCardsPageInfo } from '../../shared/cards';

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initEmpty( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const render = () => {
		const { recordsTotal } = readCardsPageInfo( gridEl );
		el.classList.toggle( 'gateway-data-cards-empty--hidden', recordsTotal > 0 );
	};

	gridEl.addEventListener( 'gatewaycards:update', render );

	render();
}

function initAll() {
	document
		.querySelectorAll( '.gateway-data-cards-empty' )
		.forEach( initEmpty );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
