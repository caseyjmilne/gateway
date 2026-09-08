/**
 * Front-end entry point for the gateway/facet-has-value block: finds each
 * rendered checkbox, waits for the sibling datatable's DataTable instance,
 * and registers a `$.fn.dataTable.ext.search` filter checking whether the
 * target column's own cell actually has text in it.
 *
 * Deliberately its own copy of gateway/facet/src/view.js's own DataTable
 * -waiting/column-lookup setup rather than a shared import -- see THAT
 * file's own docblock for why importing 'datatables.net-dt' (or anything
 * that imports it) from more than one independently-bundled view.js is a
 * real bug, not just duplication: only blocks/datatable/src/view.js may
 * ever do that. This file, like gateway/facet's own, only ever *waits for
 * and reuses* the instance that script already created (shared/wait-for
 * -datatable.js) and looks up a column index with no DataTables/jQuery
 * dependency at all (shared/dom.js) -- the plain `jquery` import below is
 * the same already-safe case that file's own docblock establishes (never
 * touches the 'datatables.net-dt' plugin module itself).
 *
 * "Has a value" here means the same thing Facet_Query::apply_collection_facets()/
 * apply_facets()'s own HAS_VALUE branches mean server-side (see those
 * methods' own docblocks) -- but checked against the cell's own rendered
 * DataTables search-data text instead of a database column, since this
 * table's rows are already fully loaded client-side (same as every other
 * gateway/facet control -- see that block's own view.js docblock). A
 * genuinely unset field always renders as empty text
 * (Column_Registry::get_cell_value()), and a real `0`/`false` value always
 * renders as the visible string "0"/"" it actually is -- '0'.length is 1,
 * so the same "non-empty string" check that correctly excludes a truly
 * blank cell just as correctly keeps a real, meaningful zero.
 */

import $ from 'jquery';
import './style.scss';
import { getColumnIndexByKey } from '../../shared/dom';
import {
	findDataTableElement,
	waitForDataTable,
} from '../../shared/wait-for-datatable';

/**
 * @param {HTMLElement} facetEl One .gateway-facet-has-value element.
 */
function initFacet( facetEl ) {
	const table = findDataTableElement( facetEl );

	if ( ! table ) {
		return;
	}

	waitForDataTable( table ).then( ( dataTable ) => {
		if ( ! dataTable ) {
			return;
		}

		const facetKey = facetEl.getAttribute( 'data-facet-key' );
		const columnIndex = getColumnIndexByKey( table, facetKey );

		// The facet's field isn't (or is no longer) one of the table's
		// displayed columns -- nothing to hook into. render.php already
		// guards against this server-side; this is just defense in depth.
		if ( columnIndex === -1 ) {
			return;
		}

		const checkbox = facetEl.querySelector(
			'.gateway-facet-has-value__checkbox'
		);

		if ( ! checkbox ) {
			return;
		}

		$.fn.dataTable.ext.search.push( function ( settings, searchData ) {
			// Scoped to THIS table, and a complete no-op while unchecked --
			// a Has Value facet nobody has interacted with must never hide
			// rows, same as every other gateway/facet control's own
			// "empty input/nothing checked" starting state.
			if ( settings.nTable !== table || ! checkbox.checked ) {
				return true;
			}

			return '' !== String( searchData[ columnIndex ] ?? '' );
		} );

		checkbox.addEventListener( 'change', () => dataTable.draw() );
	} );
}

function initAll() {
	document
		.querySelectorAll( '.gateway-facet-has-value' )
		.forEach( initFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
