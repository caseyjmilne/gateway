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
 * Importing plain 'jquery' directly here (for `$.fn.dataTable.ext.search`
 * below) is the same safe case wait-for-datatable.js's own docblock
 * already establishes -- it never touches the 'datatables.net-dt' plugin
 * module itself, just the shared jQuery instance the plugin later
 * attaches its own extensions onto.
 */

import $ from 'jquery';
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
 * Compare operators `column().search()` itself has no way to express --
 * that API (used for 'LIKE'/'=' below) is only ever a plain substring or
 * regex match against a cell's own search data, with no numeric
 * -comparison or negation concept at all. Each of these instead needs a
 * custom `$.fn.dataTable.ext.search` filter function -- see
 * registerCustomCompareFilter() below.
 */
const CUSTOM_COMPARE_OPERATORS = [ '>', '>=', '<', '<=', '!=', 'NOT LIKE' ];

/**
 * Evaluate one of CUSTOM_COMPARE_OPERATORS against a cell's own search
 * -data value -- the client-side counterpart to Facet_Query::
 * apply_collection_facets()'s own `where( $key, $compare, $value )` /
 * apply_facets()'s SQL comparisons, run in the browser instead of the
 * database since this table's rows are already fully loaded client-side
 * (see this file's own docblock -- DataTables does all filtering here,
 * never server-side).
 *
 * Numeric comparison when both sides parse as real numbers (`parseFloat`)
 * -- matching how a real database column comparison behaves for a
 * Number/Range field -- otherwise a plain string comparison, so a
 * "Greater Than"/etc. facet on non-numeric text still does *something*
 * coherent (lexicographic) instead of silently matching nothing.
 *
 * @param {string} compare    One of CUSTOM_COMPARE_OPERATORS.
 * @param {string} cellValue  The cell's own search-data value (DataTables' `data-filter` orthogonal data, when present, or its rendered text).
 * @param {string} inputValue The value typed into the facet's own input.
 * @return {boolean} Whether the row should be included.
 */
function compareValues( compare, cellValue, inputValue ) {
	if ( 'NOT LIKE' === compare ) {
		return ! cellValue.toLowerCase().includes( inputValue.toLowerCase() );
	}

	const cellNumber = parseFloat( cellValue );
	const inputNumber = parseFloat( inputValue );
	const bothNumeric = ! isNaN( cellNumber ) && ! isNaN( inputNumber );

	switch ( compare ) {
		case '>':
			return bothNumeric ? cellNumber > inputNumber : cellValue > inputValue;
		case '>=':
			return bothNumeric ? cellNumber >= inputNumber : cellValue >= inputValue;
		case '<':
			return bothNumeric ? cellNumber < inputNumber : cellValue < inputValue;
		case '<=':
			return bothNumeric ? cellNumber <= inputNumber : cellValue <= inputValue;
		case '!=':
			return bothNumeric ? cellNumber !== inputNumber : cellValue !== inputValue;
		default:
			return true;
	}
}

/**
 * Registers a `$.fn.dataTable.ext.search` filter function scoped to this
 * one facet -- DataTables' own documented extensibility point for
 * exactly this case (its own "range filtering" example uses the same
 * mechanism): a plain function run against every row on every `draw()`,
 * returning whether to include it. `ext.search` is a single, global,
 * shared array (every registered function runs for every DataTable
 * instance on the page), so this must both scope itself to `table`
 * (`settings.nTable !== table` -- never affect an unrelated table's own
 * rows) and impose no filter at all while the input is empty (`return
 * true` -- a facet with nothing typed into it yet must never hide rows).
 *
 * Registered ONCE per facet instance (not re-pushed on every keystroke --
 * every already-registered function reruns automatically on every
 * `draw()`); the input's own listener only updates the closure variable
 * this function reads and triggers that redraw.
 *
 * @param {HTMLTableElement} table       This facet's sibling `<table>`.
 * @param {Object}           dataTable   The DataTables API instance.
 * @param {number}           columnIndex Target column index.
 * @param {string}           compare     One of CUSTOM_COMPARE_OPERATORS.
 * @param {HTMLInputElement} input       The facet's own text input.
 */
function registerCustomCompareFilter( table, dataTable, columnIndex, compare, input ) {
	let currentValue = '';

	$.fn.dataTable.ext.search.push( function ( settings, searchData ) {
		if ( settings.nTable !== table || '' === currentValue ) {
			return true;
		}

		return compareValues( compare, String( searchData[ columnIndex ] ?? '' ), currentValue );
	} );

	input.addEventListener(
		'input',
		debounce( () => {
			currentValue = input.value;
			dataTable.draw();
		}, 300 )
	);
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
		// render.php normalizes data-compare to one of Facet_Query::
		// ALLOWED_COMPARE's own real operator values before it ever
		// reaches the DOM (including a legacy 'contains'/'equals' value
		// translated forward), so every one of them is meaningful here now
		// -- 'LIKE'/'=' still go through column().search() below (the two
		// that API can express directly); everything else goes through
		// registerCustomCompareFilter() instead.
		const compare = facetEl.getAttribute( 'data-compare' ) || 'LIKE';

		const applySearch = ( value, isRegex ) => {
			column.search( value, isRegex, false ).draw();
		};

		const input = facetEl.querySelector( '.gateway-facet__input' );

		if ( input ) {
			if ( CUSTOM_COMPARE_OPERATORS.includes( compare ) ) {
				registerCustomCompareFilter( table, dataTable, columnIndex, compare, input );
			} else {
				input.addEventListener(
					'input',
					debounce( () => {
						const { value } = input;

						if ( '=' === compare ) {
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
