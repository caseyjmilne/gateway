/**
 * Front-end entry point for the gateway/facet-text block: finds each
 * rendered input, waits for the sibling datatable's DataTable instance,
 * and drives DataTables' own default "Contains" column search.
 *
 * A slimmed-down clone of gateway/facet/src/view.js's own plain-substring
 * 'input' branch -- see THAT file's own docblock for why this must be its
 * own, separate copy rather than a shared import (only
 * blocks/datatable/src/view.js may ever import 'datatables.net-dt'
 * itself; this file only *waits for and reuses* the instance that script
 * already created, via shared/wait-for-datatable.js, and looks up a
 * column index with no DataTables/jQuery dependency at all, via
 * shared/dom.js). No CUSTOM_COMPARE_OPERATORS branching needed here at
 * all -- `compare` is always 'LIKE' (render.php never renders anything
 * else for this block), so this is just `column().search( value, false,
 * false ).draw()`, DataTables' own built-in "Contains" behavior.
 */

import './style.scss';
import { getColumnIndexByKey } from '../../shared/dom';
import {
	findDataTableElement,
	waitForDataTable,
} from '../../shared/wait-for-datatable';

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
 * @param {HTMLElement} facetEl One .gateway-facet-text element.
 */
function initFacet( facetEl ) {
	const table = findDataTableElement( facetEl );

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

		const input = facetEl.querySelector( '.gateway-facet__input' );

		if ( ! input ) {
			return;
		}

		const column = dataTable.column( columnIndex );

		input.addEventListener(
			'input',
			debounce( () => {
				column.search( input.value, false, false ).draw();
			}, 300 )
		);
	} );
}

function initAll() {
	document.querySelectorAll( '.gateway-facet-text' ).forEach( initFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
