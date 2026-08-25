/**
 * Front-end entry point for the gateway/facet block: finds each rendered
 * facet control, waits for the sibling datatable's DataTable instance and
 * locates the column it should drive, and wires up interaction -> filtering.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly. That
 * library attaches itself to the shared, externalized jQuery global
 * (`$.fn.DataTable`) as a side effect of being imported -- and because
 * this block's view.js and the datatable block's view.js are two
 * independently enqueued scripts, each with their own webpack bundle,
 * importing the library from *both* would execute that side effect
 * *twice*. In testing, that reset the library's internal "is this table
 * already a DataTable?" registry the second time it ran, which broke the
 * datatable block's own idempotency check and caused it to
 * double-initialize -- visibly, a duplicated "entries per page"/search/
 * pagination UI on the front end. So: only blocks/datatable/src/view.js
 * (and its editor equivalent) may ever import the library. This file only
 * *waits for and reuses* whatever instance that script already created,
 * via plain jQuery (safe -- externalized, a true singleton, never
 * bundled) and shared/dom.js's getColumnIndexByKey() (safe -- no
 * jQuery/DataTables dependency at all).
 */

import $ from 'jquery';
import './style.scss';
import { getColumnIndexByKey } from '../../shared/dom';

const POLL_INTERVAL_MS = 50;
const POLL_TIMEOUT_MS = 5000;

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
 * Wait for the sibling datatable block's own view.js to have initialized
 * DataTables on `table` (it may not have run yet -- two separately
 * enqueued scripts, no ordering guarantee between them), then resolve
 * with the DataTables API instance.
 *
 * @param {HTMLTableElement} table Table element.
 * @return {Promise<Object|null>} Resolves with the API instance, or null on timeout.
 */
function waitForDataTable( table ) {
	return new Promise( ( resolve ) => {
		const start = Date.now();

		const check = () => {
			if (
				$.fn.DataTable &&
				$.fn.DataTable.isDataTable &&
				$.fn.DataTable.isDataTable( table )
			) {
				resolve( $( table ).DataTable() );
				return;
			}

			if ( Date.now() - start > POLL_TIMEOUT_MS ) {
				resolve( null );
				return;
			}

			setTimeout( check, POLL_INTERVAL_MS );
		};

		check();
	} );
}

/**
 * @param {HTMLElement} facetEl One .gateway-facet element.
 */
function initFacet( facetEl ) {
	const table = findTable( facetEl );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

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
	} );
}

function initAll() {
	document.querySelectorAll( '.gateway-facet' ).forEach( initFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
