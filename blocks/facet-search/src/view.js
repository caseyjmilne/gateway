/**
 * Front-end entry point for the gateway/facet-search block: finds the
 * sibling datatable's DataTable instance and wires a search <input> to its
 * `search()` API -- an exact copy of gateway/datatable-search's own
 * view.js (see that file's own docblock for the full "why" of no
 * debounce, the IMPORTANT note on never importing 'datatables.net-dt'
 * directly, and hideNativeDataTableWidget()): this block IS that same
 * global search, just packaged as an optional, freely placeable
 * facet-family block instead of a fixed slot inside gateway/datatable
 * -header.
 *
 * Still calls hideNativeDataTableWidget() here too, even though gateway/
 * datatable-header's own required gateway/datatable-search already does
 * -- idempotent (it only ever removes an already-rendered native widget
 * that may or may not still be there), and this block is meant to work
 * as a full replacement on its own if a site owner ever removes that
 * required slot's own contents.
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
