/**
 * Pure "Showing X to Y of Z entries" text-building logic for
 * gateway/data-cards-results -- `buildInfoText()` only ever needs a
 * plain `{ start, end, recordsDisplay, recordsTotal }` object, fed by a
 * REST fetch response.
 *
 * Text/pluralization deliberately mirrors the well-known DataTables.net
 * library's own default `info` language strings (`sInfo`/`sInfoEmpty`/
 * `sInfoFiltered`, and the `entries`/`entry` plural pair) purely for a
 * familiar, consistent reading -- nothing here has any actual dependency
 * on that library.
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
 *                       the shape returned by
 *                       `Data_Cards_Renderer::build_pager_meta()`.
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
