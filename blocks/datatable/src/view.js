/**
 * Front-end entry point for the gateway/datatable block.
 *
 * Loaded only on pages that actually contain the block (block.json's
 * "viewScript"), this just finds every rendered table and hands it to the
 * shared DataTables initializer.
 */

import 'datatables.net-dt/css/dataTables.dataTables.css';
import './style.scss';

import { initGatewayDataTable } from '../../shared/datatable';

function initAll() {
	document.querySelectorAll( 'table.gateway-datatable' ).forEach( ( table ) => {
		initGatewayDataTable( table );
	} );
}

if ( document.readyState === 'loading' ) {
	document.addEventListener( 'DOMContentLoaded', initAll );
} else {
	initAll();
}
