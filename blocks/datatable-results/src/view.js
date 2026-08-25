/**
 * Front-end entry point for the gateway/datatable-results block: finds the
 * sibling datatable's DataTable instance and keeps a "Showing X to Y of Z
 * entries" summary in sync with it via the `draw` event -- fired after
 * every redraw, including page changes and gateway/facet-driven filtering,
 * either of which changes these counts.
 *
 * Text/pluralization deliberately mirrors DataTables' own default `info`
 * language strings (`sInfo`/`sInfoEmpty`/`sInfoFiltered`, and the
 * `entries`/`entry` plural pair) -- this block is a drop-in replacement for
 * DataTables' own default info widget (see hideNativeDataTableWidget()),
 * not a different feature, so it should read the same way.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly -- see
 * shared/wait-for-datatable.js's docblock for why (double-bundling that
 * library resets its own instance registry and breaks the datatable
 * block's idempotency check). This file only *waits for and reuses*
 * whatever instance the datatable block's own view.js already created.
 */

import './style.scss';
import {
	findDataTableElement,
	waitForDataTable,
	hideNativeDataTableWidget,
} from '../../shared/wait-for-datatable';

/**
 * @param {number} count Number of entries.
 * @return {string} 'entry' for exactly 1, 'entries' otherwise.
 */
function pluralizeEntries( count ) {
	return 1 === count ? 'entry' : 'entries';
}

/**
 * @param {Object} info The DataTables `page.info()` result.
 * @return {string} The "Showing X to Y of Z entries" (or filtered/empty variant) text.
 */
function buildInfoText( info ) {
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
 * @param {HTMLElement} el The results block's wrapper element.
 */
function initResults( el ) {
	const table = findDataTableElement( el );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		// This block is a full replacement for DataTables' own default
		// info widget, not an addition alongside it.
		hideNativeDataTableWidget( table, 'dt-info' );

		const render = () => {
			el.textContent = buildInfoText( dataTable.page.info() );
		};

		dataTable.on( 'draw', () => {
			try {
				render();
			} catch ( error ) {
				// eslint-disable-next-line no-console
				console.error( 'Gateway Results: failed to render.', error );
			}
		} );

		try {
			render();
		} catch ( error ) {
			// eslint-disable-next-line no-console
			console.error( 'Gateway Results: failed to render.', error );
		}
	} ).catch( ( error ) => {
		// eslint-disable-next-line no-console
		console.error( 'Gateway Results: failed to initialize.', error );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-datatable-results' )
		.forEach( initResults );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
