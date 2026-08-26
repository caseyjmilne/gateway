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
// pluralizeEntries()/buildInfoText() moved to shared/results-text.js (pure
// functions of a plain `{ start, end, recordsDisplay, recordsTotal }`
// object, no DataTables dependency) so gateway/data-cards-results can
// reuse the exact same wording against a REST-fetch response, without a
// second, silently-divergent copy of it.
import { buildInfoText } from '../../shared/results-text';

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
