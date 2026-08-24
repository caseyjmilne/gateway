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
 * "Show X entries" choices offered alongside the block's own Page Size
 * setting -- rendered exactly as-is if Page Size matches one of these,
 * otherwise the configured value is folded in so the dropdown always
 * reflects what's actually showing.
 */
const DEFAULT_LENGTH_MENU = [ 10, 25, 50, 100 ];

/**
 * Read the block's Page Size setting off the table (render.php writes it as
 * a data attribute), for the DataTables `pageLength` option.
 *
 * @param {HTMLTableElement} table The table element.
 * @return {number|null} A positive page length, or null if unset/invalid
 *                        (meaning: fall back to the DataTables default).
 */
function getPageLengthFromTable( table ) {
	const raw = table.getAttribute( 'data-page-size' );

	if ( ! raw ) {
		return null;
	}

	const parsed = parseInt( raw, 10 );

	return Number.isNaN( parsed ) || parsed <= 0 ? null : parsed;
}

/**
 * Build a `lengthMenu` array guaranteed to include `pageLength`, so the
 * "Show X entries" control never shows a value that isn't actually an
 * option in its own dropdown.
 *
 * @param {number|null} pageLength The configured page length, if any.
 * @return {number[]} Sorted, deduplicated length menu.
 */
function buildLengthMenu( pageLength ) {
	if ( ! pageLength ) {
		return DEFAULT_LENGTH_MENU;
	}

	return [ ...new Set( [ pageLength, ...DEFAULT_LENGTH_MENU ] ) ].sort(
		( a, b ) => a - b
	);
}

/**
 * Read per-column sortability off the table's header cells (render.php
 * writes each <th>'s data-orderable based on the block's column config),
 * for DataTables' `columns` option. Column *order* is just DOM order here,
 * since render.php already emits <th>/<td> in the block's configured order.
 *
 * @param {HTMLTableElement} table The table element.
 * @return {Object[]} One `{ orderable }` entry per header cell, in order.
 */
function getColumnConfigFromTable( table ) {
	return Array.from( table.querySelectorAll( 'thead th' ) ).map( ( th ) => ( {
		orderable: th.getAttribute( 'data-orderable' ) !== 'false',
	} ) );
}

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

	const pageLength = getPageLengthFromTable( table );
	const columns = getColumnConfigFromTable( table );

	return $( table ).DataTable( {
		...DEFAULT_OPTIONS,
		...( pageLength ? { pageLength } : {} ),
		lengthMenu: buildLengthMenu( pageLength ),
		...( columns.length ? { columns } : {} ),
		// The default order targets column 0 ("ID" originally); once
		// columns are configurable that column may not exist or may not be
		// orderable, so only order by it when it actually is.
		order: columns.length && columns[ 0 ].orderable ? [ [ 0, 'desc' ] ] : [],
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
