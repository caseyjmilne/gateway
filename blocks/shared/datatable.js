/**
 * Shared DataTables init/teardown helpers.
 *
 * Lives here -- blocks/shared/, a sibling of the per-block directories
 * webpack.config.js globs for entries, not inside any one block's own src/
 * -- because it's genuinely used across block boundaries: the datatable
 * block's editor (edit.js, via hooks/use-datatable-init.js) and front end
 * (view.js), *and* the facet block's front end (also view.js), which finds
 * a DataTable instance a sibling datatable block already initialized (or
 * initializes it fresh itself, if its own script happens to run first --
 * initGatewayDataTable() is idempotent, see below) before hooking into it.
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
 * Read which columns are marked non-sortable off the table's header cells
 * (render.php writes each <th>'s data-orderable based on the block's column
 * config), as zero-based indexes for DataTables' `columnDefs` `targets`.
 *
 * Deliberately building `columnDefs` (selectively overriding just the
 * non-orderable columns) rather than a full `columns` array covering every
 * column: DataTables requires a `columns` array to have exactly one entry
 * per header cell, in order -- any mismatch between that array and the
 * table's actual header count is a documented DataTables error condition.
 * A block instance whose editor preview and REST-rendered markup could
 * ever transiently disagree on header count (or any bug in this file that
 * miscounts) would then fail in the worst possible direction: silently
 * falling back to "every column orderable", the opposite of what was
 * configured, rather than visibly breaking. `columnDefs` with explicit
 * `targets` has no such all-or-nothing requirement -- a column that isn't
 * actually marked non-orderable just keeps DataTables' own default
 * (orderable), so this can only ever fail toward "orderable it shouldn't
 * be", never toward silently discarding every column's configuration.
 *
 * @param {HTMLTableElement} table The table element.
 * @return {number[]} Zero-based indexes of columns that should NOT be sortable.
 */
function getNonOrderableTargets( table ) {
	return Array.from( table.querySelectorAll( 'thead th' ) ).reduce(
		( targets, th, index ) => {
			if ( th.getAttribute( 'data-orderable' ) === 'false' ) {
				targets.push( index );
			}
			return targets;
		},
		[]
	);
}

/**
 * Find a column's index by the field key render.php wrote onto its <th> as
 * data-column-key -- how a Facet block locates the column it should drive
 * `.column( index ).search()` against. A facet only works for a field
 * that's also a displayed column (the editor warns when it isn't -- see
 * facet-key-control.js), so a facet whose key isn't found here has nothing
 * to hook into and its view.js simply no-ops.
 *
 * @param {HTMLTableElement} table Table element.
 * @param {string}           key   Field key to look for.
 * @return {number} Zero-based column index, or -1 if not found.
 */
export function getColumnIndexByKey( table, key ) {
	return Array.from( table.querySelectorAll( 'thead th' ) ).findIndex(
		( th ) => th.getAttribute( 'data-column-key' ) === key
	);
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
	const nonOrderableTargets = getNonOrderableTargets( table );
	const firstColumnIsOrderable = ! nonOrderableTargets.includes( 0 );

	return $( table ).DataTable( {
		...DEFAULT_OPTIONS,
		...( pageLength ? { pageLength } : {} ),
		lengthMenu: buildLengthMenu( pageLength ),
		...( nonOrderableTargets.length
			? { columnDefs: [ { targets: nonOrderableTargets, orderable: false } ] }
			: {} ),
		// The default order targets column 0 ("ID" originally); once
		// columns are configurable that column may not exist or may not be
		// orderable, so only order by it when it actually is.
		order: firstColumnIsOrderable ? [ [ 0, 'desc' ] ] : [],
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
