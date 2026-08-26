/**
 * Pure "Show X entries" length-menu logic, shared by every page-size
 * control in this plugin.
 *
 * Originally lived inside blocks/shared/datatable.js, which is NOT safe to
 * import from anywhere except gateway/datatable's own view.js/edit.js (it
 * imports 'datatables.net-dt' as a side effect -- see that file's own
 * docblock for why a second, independently-bundled copy of that import is
 * an actual bug, not just wasted bytes). This function has zero DataTables
 * dependency of its own -- a pure `(pageSize) => number[]` transform -- so
 * it's split out here where gateway/data-cards-page-size's editor preview
 * can import it directly, without transitively pulling in DataTables.
 */

/**
 * "Show X entries" choices offered alongside a block's own Page Size
 * setting -- rendered exactly as-is if Page Size matches one of these,
 * otherwise the configured value is folded in so the dropdown always
 * reflects what's actually showing.
 */
export const DEFAULT_LENGTH_MENU = [ 10, 25, 50, 100 ];

/**
 * Build a length menu array guaranteed to include `pageLength`, so a
 * "Show X entries" control never shows a value that isn't actually an
 * option in its own dropdown.
 *
 * @param {number|null} pageLength The configured page length, if any.
 * @return {number[]} Sorted, deduplicated length menu.
 */
export function buildLengthMenu( pageLength ) {
	if ( ! pageLength ) {
		return DEFAULT_LENGTH_MENU;
	}

	return [ ...new Set( [ pageLength, ...DEFAULT_LENGTH_MENU ] ) ].sort(
		( a, b ) => a - b
	);
}
