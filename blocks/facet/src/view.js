/**
 * Front-end entry point for the gateway/facet block: finds each rendered
 * facet control, waits for the sibling datatable's DataTable instance and
 * locates the column it should drive, and wires up interaction -> filtering.
 *
 * IMPORTANT: this file must never `import` anything from
 * blocks/shared/datatable.js, or 'datatables.net-dt' directly. That
 * library attaches itself to the shared, externalized jQuery global
 * (`$.fn.DataTable`) as a side effect of being imported -- and because
 * this block's view.js and the datatable block's view.js are two
 * independently enqueued scripts, each with their own webpack bundle,
 * importing the library from *both* would execute that side effect
 * *twice*. In testing, that reset the library's internal "is this table
 * already a DataTable?" registry the second time it ran, which broke the
 * datatable block's own idempotency check and caused it to
 * double-initialize -- visibly, a duplicated "entries per page"/search/
 * pagination UI on the front end. So: only blocks/datatable/src/view.js
 * (and its editor equivalent) may ever import the library. This file only
 * *waits for and reuses* whatever instance that script already created,
 * via shared/wait-for-datatable.js (safe -- only imports plain jQuery,
 * externalized, a true singleton, never bundled) and shared/dom.js's
 * getColumnIndexByKey() (safe -- no jQuery/DataTables dependency at all).
 */

import './style.scss';
import { getColumnIndexByKey } from '../../shared/dom';
import {
	findDataTableElement,
	waitForDataTable,
} from '../../shared/wait-for-datatable';

/**
 * Escape a value for safe use inside a DataTables regex search.
 *
 * @param {string} value Raw value.
 * @return {string} Regex-escaped value.
 */
function escapeRegex( value ) {
	return value.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
}

/**
 * Build a regex matching a cell if ANY of `values` appears in it as a full,
 * standalone comma-list item -- not `^value$` (the whole cell must equal
 * value), because a taxonomy column's cell can hold multiple comma
 * -separated term names (Column_Registry::get_cell_value()) for a single
 * post. This still matches correctly for an ordinary single-value cell
 * (core/meta columns): with one item and no siblings, `(^|, )` and `(, |$)`
 * just collapse to the start/end anchors `^value$` would have been.
 *
 * @param {string[]} values Values to match (regex-escaped internally).
 * @return {string} Regex pattern for DataTables' `column().search()`.
 */
function exactMatchPattern( values ) {
	const alternation = values.map( escapeRegex ).join( '|' );
	return `(^|, )(${ alternation })(, |$)`;
}

/**
 * @param {Function} fn   Function to debounce.
 * @param {number}   wait Delay in ms.
 * @return {Function} Debounced function.
 */
function debounce( fn, wait ) {
	let timeout;
	return ( ...args ) => {
		clearTimeout( timeout );
		timeout = setTimeout( () => fn( ...args ), wait );
	};
}

/**
 * @param {HTMLElement} facetEl One .gateway-facet element.
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

		const column = dataTable.column( columnIndex );
		const compare =
			facetEl.getAttribute( 'data-compare' ) === 'equals'
				? 'equals'
				: 'contains';

		const applySearch = ( value, isRegex ) => {
			column.search( value, isRegex, false ).draw();
		};

		const input = facetEl.querySelector( '.gateway-facet__input' );

		if ( input ) {
			input.addEventListener(
				'input',
				debounce( () => {
					const { value } = input;

					if ( 'equals' === compare ) {
						applySearch(
							value ? exactMatchPattern( [ value ] ) : '',
							true
						);
					} else {
						// Plain substring search -- "Contains", DataTables'
						// own default behavior.
						applySearch( value, false );
					}
				}, 300 )
			);
		}

		const select = facetEl.querySelector( '.gateway-facet__select' );

		if ( select ) {
			select.addEventListener( 'change', () => {
				const { value } = select;
				// Select/Checkboxes are always exact matches against a fixed
				// list of values, regardless of `compare` (that only governs
				// Input -- see compare-control.js).
				applySearch(
					value ? exactMatchPattern( [ value ] ) : '',
					true
				);
			} );
		}

		const checkboxes = facetEl.querySelectorAll(
			'.gateway-facet__checkbox'
		);

		if ( checkboxes.length ) {
			const handleChange = () => {
				const checkedValues = Array.from( checkboxes )
					.filter( ( checkbox ) => checkbox.checked )
					.map( ( checkbox ) => checkbox.value );

				// OR-match any checked value; nothing checked means no filter.
				applySearch(
					checkedValues.length
						? exactMatchPattern( checkedValues )
						: '',
					true
				);
			};

			checkboxes.forEach( ( checkbox ) =>
				checkbox.addEventListener( 'change', handleChange )
			);
		}
	} );
}

function initAll() {
	document.querySelectorAll( '.gateway-facet' ).forEach( initFacet );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
