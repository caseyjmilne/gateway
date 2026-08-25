/**
 * Shared "find my sibling table, and wait for the datatable block's own
 * view.js to have initialized DataTables on it" logic.
 *
 * Only imports plain 'jquery' -- never 'datatables.net-dt' itself, nor
 * shared/datatable.js, which does. Importing that library from more than
 * one independently-bundled entry point executes its global-attachment
 * side effect twice, which resets DataTables' own "is this table already a
 * DataTable?" registry and causes it to double-initialize (see the large
 * comment in shared/datatable.js). jQuery itself is safe to import from
 * anywhere: it's externalized by @wordpress/dependency-extraction-webpack
 * -plugin and never bundled, so every entry point that imports it shares
 * the exact same instance.
 *
 * Used by both blocks/facet/src/view.js and blocks/pagination/src/view.js
 * -- any future block that needs to hook into an existing DataTable
 * instance without itself creating one should use this too, rather than
 * duplicating the polling logic.
 */

import $ from 'jquery';

const POLL_INTERVAL_MS = 50;
const POLL_TIMEOUT_MS = 5000;

/**
 * @param {HTMLElement} el Any element inside a gateway/datatable block.
 * @return {HTMLTableElement|null} The sibling datatable's <table>, if any.
 */
export function findDataTableElement( el ) {
	const wrapper = el.closest( '.gateway-datatable-block' );
	return wrapper ? wrapper.querySelector( 'table.gateway-datatable' ) : null;
}

/**
 * Wait for the datatable block's own view.js to have initialized DataTables
 * on `table` (it may not have run yet -- two separately enqueued scripts,
 * no ordering guarantee between them), then resolve with the DataTables API
 * instance.
 *
 * @param {HTMLTableElement} table Table element.
 * @return {Promise<Object|null>} Resolves with the API instance, or null on timeout.
 */
export function waitForDataTable( table ) {
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
