/**
 * Populates and wires a "Show N entries per page" `<select>` to a live
 * DataTable instance -- shared between the front end (view.js) and the
 * editor's own live preview (edit.js), so the exact same choice list and
 * wiring drives both, rather than the editor showing a fixed, generic
 * option list unrelated to the site's actual configured Page Size.
 */

import { hideNativeDataTableWidget } from '../../shared/wait-for-datatable';

/**
 * @param {HTMLElement}      el        The page-size block's own wrapper element.
 * @param {HTMLTableElement} table     The sibling `<table>` -- only needed to find and remove DataTables' own default length widget.
 * @param {Object}           dataTable The live DataTables API instance.
 * @return {Function} Cleanup -- removes the `change` listener this attached, safe to call more than once.
 */
export function attachPageSize( el, table, dataTable ) {
	const select = el.querySelector( '.gateway-datatable-page-size__select' );

	if ( ! select ) {
		return () => {};
	}

	// The same computed choice list `shared/datatable.js` passed to
	// DataTables at init time (the site's configured Page Size folded into
	// the default [10, 25, 50, 100] -- so a smaller configured value like
	// `1` shows up here too, not just on the front end) -- `init()` returns
	// the full, already-merged-with-defaults options object DataTables was
	// constructed with, so this is the one source of truth for that list
	// rather than a second copy of how it's computed.
	const lengthMenu = dataTable.init().lengthMenu || [ 10, 25, 50, 100 ];

	select.textContent = '';

	lengthMenu.forEach( ( length ) => {
		const option = el.ownerDocument.createElement( 'option' );
		option.value = String( length );
		option.textContent = -1 === length ? 'All' : String( length );
		select.appendChild( option );
	} );

	select.value = String( dataTable.page.len() );
	select.disabled = false;

	const onChange = () => {
		dataTable.page.len( Number( select.value ) ).draw();
	};

	select.addEventListener( 'change', onChange );

	// This block is a full replacement for DataTables' own default
	// page-length control, not an addition alongside it.
	hideNativeDataTableWidget( table, 'dt-length' );

	return () => {
		select.removeEventListener( 'change', onChange );
	};
}
