/**
 * Shared DataTables init/teardown helpers.
 *
 * Used both by the editor (edit.js, via hooks/use-datatable-init.js) and the
 * front end (view.js), so the exact same DataTables configuration runs in
 * both places. Keeping this logic here also means future child blocks
 * (heading, row, pagination, facets, ...) can reuse it against whatever
 * sub-table they end up managing.
 */

import $ from 'jquery';
import 'datatables.net-dt';

/**
 * Default DataTables options for every Gateway datatable instance.
 */
const DEFAULT_OPTIONS = {
	paging: true,
	searching: true,
	ordering: true,
	order: [ [ 0, 'desc' ] ],
	responsive: false,
};

/**
 * Initialize (or re-fetch an existing) DataTable instance on a <table>.
 *
 * @param {HTMLTableElement} table   The table element to enhance.
 * @param {Object}           options Extra/overriding DataTables options.
 * @return {Object|null} The DataTables API instance, or null if no table was given.
 */
export function initGatewayDataTable( table, options = {} ) {
	if ( ! table ) {
		return null;
	}

	if ( $.fn.DataTable.isDataTable( table ) ) {
		return $( table ).DataTable();
	}

	return $( table ).DataTable( {
		...DEFAULT_OPTIONS,
		...options,
	} );
}

/**
 * Tear down a DataTable instance if one exists on the given table.
 *
 * Always call this before re-initializing a table whose contents changed
 * (e.g. after a Post Type change re-renders the server-side preview) --
 * DataTables throws if you try to re-init a table it already manages.
 *
 * @param {HTMLTableElement} table The table element to tear down.
 */
export function destroyGatewayDataTable( table ) {
	if ( table && $.fn.DataTable.isDataTable( table ) ) {
		$( table ).DataTable().destroy();
	}
}
