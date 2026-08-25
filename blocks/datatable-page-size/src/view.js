/**
 * Front-end entry point for the gateway/datatable-page-size block: finds
 * the sibling datatable's DataTable instance and hands off to
 * attach-page-size.js to populate and wire the "Show N entries per page"
 * `<select>`, replacing DataTables' own default page-length control.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's docblock for why (double-bundling that
 * library resets its own instance registry and breaks the datatable
 * block's idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 */

import './style.scss';
import { findDataTableElement, waitForDataTable } from '../../shared/wait-for-datatable';
import { attachPageSize } from './attach-page-size';

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

		try {
			attachPageSize( el, table, dataTable );
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Page Size: failed to initialize.', error );
		}
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
