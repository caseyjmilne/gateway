/**
 * Builds and keeps the "Showing X to Y of Z entries" text in sync with a
 * live DataTable instance -- shared between the front end (view.js) and
 * the editor's own live preview (edit.js), so the exact same text-building
 * logic drives both, rather than the editor showing a fixed, fake summary
 * unrelated to the table it sits next to.
 *
 * Text/pluralization deliberately mirrors DataTables' own default `info`
 * language strings (`sInfo`/`sInfoEmpty`/`sInfoFiltered`, and the
 * `entries`/`entry` plural pair) -- this block is a drop-in replacement for
 * DataTables' own default info widget, not a different feature, so it
 * should read the same way.
 */

import { hideNativeDataTableWidget } from '../../shared/wait-for-datatable';

/**
 * @param {number} count Number of entries.
 * @return {string} 'entry' for exactly 1, 'entries' otherwise.
 */
export function pluralizeEntries( count ) {
	return 1 === count ? 'entry' : 'entries';
}

/**
 * @param {Object} info The DataTables `page.info()` result.
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

/**
 * @param {HTMLElement}      el        The results block's own wrapper element.
 * @param {HTMLTableElement} table     The sibling `<table>` -- only needed to find and remove DataTables' own default info widget.
 * @param {Object}           dataTable The live DataTables API instance.
 * @return {Function} Cleanup -- removes the `draw` listener this attached, safe to call more than once.
 */
export function attachResults( el, table, dataTable ) {
	// This block is a full replacement for DataTables' own default info
	// widget, not an addition alongside it.
	hideNativeDataTableWidget( table, 'dt-info' );

	const render = () => {
		el.textContent = buildInfoText( dataTable.page.info() );
	};

	const onDraw = () => {
		try {
			render();
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Results: failed to render.', error );
		}
	};

	dataTable.on( 'draw', onDraw );

	try {
		render();
	} catch ( error ) {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Results: failed to render.', error );
	}

	return () => {
		dataTable.off( 'draw', onDraw );
	};
}
