/**
 * Front-end entry point for the gateway/datatable-search block: finds the
 * sibling datatable's DataTable instance and wires a search <input> to its
 * `search()` API, replacing DataTables' own default global search box.
 *
 * Deliberately no debounce: DataTables' own default search box applies on
 * every keystroke with no artificial delay (its own `searchDelay` option
 * defaults to null, and `shared/datatable.js` never sets it) -- this is a
 * drop-in replacement for that control, not a different feature, so it
 * matches that behavior exactly rather than the 300ms debounce
 * gateway/facet's Input control uses for a very different reason (many
 * independent per-column filters, not one whole-table one).
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
 * @param {HTMLElement} el The search block's wrapper element.
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

		const input = el.querySelector( '.gateway-datatable-search__input' );

		if ( ! input ) {
			return;
		}

		input.value = dataTable.search() || '';
		input.disabled = false;

		input.addEventListener( 'input', () => {
			dataTable.search( input.value ).draw();
		} );

		// This block is a full replacement for DataTables' own default
		// search box, not an addition alongside it.
		hideNativeDataTableWidget( table, 'dt-search' );
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Search: failed to initialize.', error );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-datatable-search' )
		.forEach( initSearch );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
