/**
 * Front-end entry point for the gateway/pagination block: finds the sibling
 * datatable's DataTable instance and wires Previous/Next/page-number
 * controls to its `page()` API, keeping them in sync via the `draw` event
 * -- fired after every redraw, including page changes and gateway/facet
 * -driven filtering, either of which can change the total page count.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's docblock for why (double-bundling that
 * library resets its own instance registry and breaks the datatable
 * block's idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 *
 * The actual button-building/wiring logic lives in attach-pagination.js,
 * shared with the editor's own live preview (hooks/use-editor-preview.js)
 * -- this file is just "find the table, wait for it, hand off".
 */

import './style.scss';
import { findDataTableElement, waitForDataTable } from '../../shared/wait-for-datatable';
import { attachPagination } from './attach-pagination';

/**
 * @param {HTMLElement} el The pagination block's wrapper element.
 */
function initPagination( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		try {
			attachPagination( el, table, dataTable );
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Pagination: failed to initialize.', error );
		}
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Pagination: failed to initialize.', error );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-pagination' )
		.forEach( initPagination );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
