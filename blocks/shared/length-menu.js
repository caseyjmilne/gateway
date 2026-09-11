/**
 * Pure "Show X entries" length-menu logic, shared by every page-size
 * control in this plugin -- a plain `(pageSize) => number[]` transform
 * with no dependencies of its own, safe for any block's editor preview to
 * import directly. Mirrors `Data_Cards_Renderer::DEFAULT_LENGTH_MENU`/
 * `build_length_menu()`, the real PHP counterpart used for the front end.
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
