/**
 * Front-end entry point for the gateway/facet-search block: finds the
 * sibling datatable's DataTable instance and wires a search <input> to its
 * `search()` API -- this plugin's single, shared Data Table search
 * implementation (see render.php's own docblock for the "why" of the
 * now-removed gateway/datatable-search this block replaced). Deliberately
 * no debounce: matches DataTables' own default search box behavior (its
 * own `searchDelay` option defaults to null), a drop-in replacement for
 * that native control, not a different feature.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's own docblock for why (double-bundling
 * that library resets its own instance registry and breaks the datatable
 * block's own idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 *
 * Calls hideNativeDataTableWidget() -- idempotent (it only ever removes
 * an already-rendered native widget that may or may not still be there)
 * -- since this block is meant to work as a full replacement for
 * DataTables' own default search box on its own, wherever it's placed.
 *
 * "Facets together" with any other active gateway/facet(-has-value/-text)
 * controls needs nothing extra here: DataTables' own filtering pass
 * already ANDs a global `.search()` term against every active per-column
 * search/ext.search filter automatically -- see render.php's own
 * docblock.
 */

import './style.scss';
import {
	findDataTableElement,
	waitForDataTable,
	hideNativeDataTableWidget,
} from '../../shared/wait-for-datatable';

/**
 * @param {HTMLElement} el This block's own wrapper element.
 */
function initSearch( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		const input = el.querySelector( '.gateway-facet-search__input' );

		if ( ! input ) {
			return;
		}

		input.value = dataTable.search() || '';
		input.disabled = false;

		input.addEventListener( 'input', () => {
			dataTable.search( input.value ).draw();
		} );

		hideNativeDataTableWidget( table, 'dt-search' );
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Facet Search: failed to initialize.', error );
	} );
}

function initAll() {
	document.querySelectorAll( '.gateway-facet-search' ).forEach( initSearch );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
