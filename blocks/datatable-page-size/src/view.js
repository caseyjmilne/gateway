/**
 * Front-end entry point for the gateway/datatable-page-size block: finds
 * the sibling datatable's DataTable instance and wires a "Show N entries
 * per page" <select> to its `page.len()` API, replacing DataTables' own
 * default page-length control.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's docblock for why (double-bundling that
 * library resets its own instance registry and breaks the datatable
 * block's idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 */

import './style.scss';
import {
	findDataTableElement,
	waitForDataTable,
	hideNativeDataTableWidget,
} from '../../shared/wait-for-datatable';

/**
 * @param {HTMLElement} el The page-size block's wrapper element.
 */
function initPageSize( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		const select = el.querySelector( '.gateway-datatable-page-size__select' );

		if ( ! select ) {
			return;
		}

		// The same computed choice list `shared/datatable.js` passed to
		// DataTables at init time (the site's configured Page Size folded
		// into the default [10, 25, 50, 100]) -- `init()` returns the
		// full, already-merged-with-defaults options object DataTables
		// was constructed with, so this is the one source of truth for
		// that list rather than a second copy of how it's computed.
		const lengthMenu = dataTable.init().lengthMenu || [ 10, 25, 50, 100 ];

		select.textContent = '';

		lengthMenu.forEach( ( length ) => {
			const option = document.createElement( 'option' );
			option.value = String( length );
			option.textContent = -1 === length ? 'All' : String( length );
			select.appendChild( option );
		} );

		select.value = String( dataTable.page.len() );
		select.disabled = false;

		select.addEventListener( 'change', () => {
			dataTable.page.len( Number( select.value ) ).draw();
		} );

		// This block is a full replacement for DataTables' own default
		// page-length control, not an addition alongside it.
		hideNativeDataTableWidget( table, 'dt-length' );
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Page Size: failed to initialize.', error );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-datatable-page-size' )
		.forEach( initPageSize );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
