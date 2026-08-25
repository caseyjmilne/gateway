/**
 * DOM-only helpers with no jQuery/DataTables dependency.
 *
 * Kept deliberately separate from shared/datatable.js, which imports
 * 'datatables.net-dt' as a module-level side effect: that import must only
 * ever happen from blocks/datatable/src/{view,edit}.js's bundles (see the
 * big comment in facet/src/view.js for why a second, independently
 * -bundled copy of that import is an actual bug, not just wasted bytes).
 * Anything that doesn't specifically need to initialize/destroy a
 * DataTable belongs here instead, so importing it can never accidentally
 * drag the library into a bundle that shouldn't have it.
 */

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
