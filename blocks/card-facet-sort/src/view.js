import './style.scss';
import {
	findCardsGridElement,
	fetchCardsPage,
	renderCardsPage,
	handleCardsFetchError,
} from '../../shared/cards';

/**
 * Wires the `<select>` to a refetch against the sibling Data Cards grid's
 * REST endpoint -- the gateway/card-facet-sort equivalent of gateway/
 * card-facet-search's own debounced-input wiring, just swapping which of
 * the grid's own dataset properties get set before the fetch
 * (`orderBy`/`order` instead of `search`) and firing once per `change`
 * rather than debounced per keystroke (a `<select>` has no keystroke
 * -per-change concept to begin with).
 *
 * `fetchCardsPage()` already reads `data-order-by`/`data-order` directly
 * off the grid element on every call, regardless of which widget
 * triggered it (see shared/cards.js's own docblock) -- so setting those
 * two dataset properties here is the entire "apply the new sort" step;
 * no other plumbing needed.
 *
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initSort( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const select = el.querySelector( '.gateway-card-facet-sort__select' );

	if ( ! select ) {
		return;
	}

	select.addEventListener( 'change', () => {
		const [ key, direction ] = select.value.split( ':' );

		gridEl.dataset.orderBy = key;
		gridEl.dataset.order = direction;

		// Page 0 -- a new sort changes what's "first," same as a new
		// search term already resets to the first page.
		fetchCardsPage( { gridEl, page: 0, search: gridEl.dataset.search || '' } )
			.then( ( response ) =>
				renderCardsPage( gridEl, response, gridEl.dataset.search || '' )
			)
			.catch( handleCardsFetchError );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-card-facet-sort' )
		.forEach( initSort );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
