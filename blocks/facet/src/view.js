/**
 * Front-end entry point for the gateway/facet block: finds each rendered
 * facet control, locates the sibling datatable's DataTable instance and
 * the column it should drive, and wires up interaction -> filtering.
 *
 * Script-order note: this doesn't assume the datatable block's own view.js
 * has already run. initGatewayDataTable() is idempotent (returns the
 * existing instance if one's already there, initializes fresh otherwise),
 * so whichever of the two block types' view scripts happens to execute
 * first still ends up at the same, single DataTable instance.
 */

import './style.scss';
import { initGatewayDataTable, getColumnIndexByKey } from '../../shared/datatable';

/**
 * Escape a value for safe use inside a DataTables regex search.
 *
 * @param {string} value Raw value.
 * @return {string} Regex-escaped value.
 */
function escapeRegex( value ) {
	return value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}

/**
 * @param {Function} fn   Function to debounce.
 * @param {number}   wait Delay in ms.
 * @return {Function} Debounced function.
 */
function debounce( fn, wait ) {
	let timeout;
	return ( ...args ) => {
		clearTimeout( timeout );
		timeout = setTimeout( () => fn( ...args ), wait );
	};
}

/**
 * @param {HTMLElement} facetEl The facet's wrapper element.
 * @return {HTMLTableElement|null} The sibling datatable's <table>, if any.
 */
function findTable( facetEl ) {
	const wrapper = facetEl.closest( '.gateway-datatable-block' );
	return wrapper ? wrapper.querySelector( 'table.gateway-datatable' ) : null;
}

/**
 * @param {HTMLElement} facetEl One .gateway-facet element.
 */
function initFacet( facetEl ) {
	const table = findTable( facetEl );

	if ( ! table ) {
		return;
	}

	const dataTable = initGatewayDataTable( table );
	const facetKey = facetEl.getAttribute( 'data-facet-key' );
	const columnIndex = getColumnIndexByKey( table, facetKey );

	// The facet's field isn't (or is no longer) one of the table's
	// displayed columns -- nothing to hook into. render.php already
	// guards against this server-side; this is just defense in depth.
	if ( columnIndex === -1 ) {
		return;
	}

	const column = dataTable.column( columnIndex );

	const applySearch = ( value, isRegex ) => {
		column.search( value, isRegex, false ).draw();
	};

	const input = facetEl.querySelector( '.gateway-facet__input' );

	if ( input ) {
		input.addEventListener(
			'input',
			debounce( () => applySearch( input.value, false ), 300 )
		);
	}

	const select = facetEl.querySelector( '.gateway-facet__select' );

	if ( select ) {
		select.addEventListener( 'change', () => {
			const { value } = select;
			// Anchored regex for an exact match, rather than DataTables'
			// default substring search -- picking one option shouldn't
			// also match every OTHER value that happens to contain it.
			applySearch( value ? `^${ escapeRegex( value ) }$` : '', true );
		} );
	}

	const checkboxes = facetEl.querySelectorAll( '.gateway-facet__checkbox' );

	if ( checkboxes.length ) {
		const handleChange = () => {
			const checkedValues = Array.from( checkboxes )
				.filter( ( checkbox ) => checkbox.checked )
				.map( ( checkbox ) => escapeRegex( checkbox.value ) );

			// OR-match any checked value; nothing checked means no filter.
			applySearch(
				checkedValues.length ? `^(${ checkedValues.join( '|' ) })$` : '',
				true
			);
		};

		checkboxes.forEach( ( checkbox ) =>
			checkbox.addEventListener( 'change', handleChange )
		);
	}
}

function initAll() {
	document.querySelectorAll( '.gateway-facet' ).forEach( initFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
