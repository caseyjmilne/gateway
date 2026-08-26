/**
 * Pure "Showing X to Y of Z entries" text-building logic, shared by every
 * results-count control in this plugin.
 *
 * Originally lived inside blocks/datatable-results/src/attach-results.js
 * (the gateway/datatable-results block, fed by a live DataTables `page
 * .info()` result). Moved here, unchanged, so gateway/data-cards-results
 * (fed by a REST fetch response instead) can share the exact same wording
 * without a copy-pasted, silently-divergent second implementation --
 * `buildInfoText()` only ever needed a plain `{ start, end, recordsDisplay,
 * recordsTotal }` object, never DataTables itself, so relocating it costs
 * nothing.
 *
 * Text/pluralization deliberately mirrors DataTables' own default `info`
 * language strings (`sInfo`/`sInfoEmpty`/`sInfoFiltered`, and the
 * `entries`/`entry` plural pair) -- gateway/datatable-results is a drop-in
 * replacement for DataTables' own default info widget, so it reads the
 * same way; gateway/data-cards-results reuses the same wording purely for
 * consistency across both grid types, not because anything DataTables
 * -specific is involved here.
 */

/**
 * @param {number} count Number of entries.
 * @return {string} 'entry' for exactly 1, 'entries' otherwise.
 */
export function pluralizeEntries( count ) {
	return 1 === count ? 'entry' : 'entries';
}

/**
 * @param {Object} info `{ start, end, recordsDisplay, recordsTotal }` --
 *                       DataTables' own `page.info()` shape, or (for
 *                       gateway/data-cards) the equivalently-shaped object
 *                       returned by `Data_Cards_Renderer::build_pager_meta()`.
 * @return {string} The "Showing X to Y of Z entries" (or filtered/empty variant) text.
 */
export function buildInfoText( info ) {
	if ( 0 === info.recordsDisplay ) {
		return `Showing 0 to 0 of 0 ${ pluralizeEntries( 0 ) }`;
	}

	let text = `Showing ${ info.start + 1 } to ${ info.end } of ${
		info.recordsDisplay
	} ${ pluralizeEntries( info.recordsDisplay ) }`;

	if ( info.recordsDisplay !== info.recordsTotal ) {
		text += ` (filtered from ${ info.recordsTotal } total ${ pluralizeEntries(
			info.recordsTotal
		) })`;
	}

	return text;
}
