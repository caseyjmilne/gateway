/**
 * Wires the search input to a debounced fetch against the sibling Data
 * Cards grid's REST endpoint -- the gateway/data-cards equivalent of
 * gateway/datatable-search's `dataTable.search(value).draw()` call.
 *
 * Deliberately debounced (300ms, the same delay gateway/facet's own Input
 * control already uses), UNLIKE gateway/datatable-search's own input,
 * which is explicitly debounce-free: that one drives DataTables' client
 * -side search, cheap enough to run on every keystroke; this one drives a
 * network request per change, which is not.
 */

import './style.scss';
import {
	findCardsGridElement,
	fetchCardsPage,
	renderCardsPage,
	handleCardsFetchError,
} from '../../shared/cards';

const DEBOUNCE_MS = 300;

/**
 * @param {Function} fn   Function to debounce.
 * @param {number}   wait Delay in milliseconds.
 * @return {Function} Debounced wrapper.
 */
function debounce( fn, wait ) {
	let timeout;
	return ( ...args ) => {
		clearTimeout( timeout );
		timeout = setTimeout( () => fn( ...args ), wait );
	};
}

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initSearch( el ) {
	const gridEl = findCardsGridElement( el );

	if ( ! gridEl ) {
		return;
	}

	const input = el.querySelector( '.gateway-data-cards-search__input' );

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
		.querySelectorAll( '.gateway-data-cards-search' )
		.forEach( initSearch );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
