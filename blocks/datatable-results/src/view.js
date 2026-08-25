/**
 * Front-end entry point for the gateway/datatable-results block: finds the
 * sibling datatable's DataTable instance and hands off to attach-results.js
 * to keep the "Showing X to Y of Z entries" summary in sync with it.
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
import { attachResults } from './attach-results';

/**
 * @param {HTMLElement} el The results block's wrapper element.
 */
function initResults( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		try {
			attachResults( el, table, dataTable );
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Results: failed to initialize.', error );
		}
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Results: failed to initialize.', error );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-datatable-results' )
		.forEach( initResults );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
