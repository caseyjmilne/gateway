/**
 * React hook that keeps a DataTables instance in sync with a container whose
 * contents are (re-)rendered asynchronously, such as <ServerSideRender>.
 *
 * Why a MutationObserver instead of just an effect on the rendered markup:
 * <ServerSideRender> fetches its markup from the REST API and swaps it into
 * the DOM itself, outside of React's normal render cycle, so there's no prop
 * change we can key an effect off of for "the table just appeared/changed".
 * Watching the container for DOM mutations is the reliable way to know when
 * a new <table class="gateway-datatable"> has landed and (re)initialize it.
 *
 * Editor iframe note: since WP 5.9 the block canvas renders inside an
 * <iframe>, so `containerRef.current` belongs to the iframe's document while
 * this script itself executes in the top window (where wp.jQuery lives).
 * jQuery/DataTables operate on DOM nodes directly and don't require the
 * node's document to match their own global `document`, so initializing
 * against the iframe node from here works -- this is the standard approach
 * for driving legacy jQuery plugins from block editor code.
 */

import { useEffect } from '@wordpress/element';
import { initGatewayDataTable, destroyGatewayDataTable } from '../shared/datatable';

/**
 * @param {Object} containerRef React ref to the element that will contain the rendered <table>.
 * @param {Array}  deps         Dependency array; re-runs (re-inits) whenever these change.
 */
export function useDataTableInit( containerRef, deps = [] ) {
	useEffect( () => {
		const container = containerRef.current;

		if ( ! container ) {
			return;
		}

		let currentTable = null;

		const syncTable = () => {
			const table = container.querySelector( 'table.gateway-datatable' );

			if ( table && table !== currentTable ) {
				destroyGatewayDataTable( currentTable );
				try {
					initGatewayDataTable( table );
				} catch ( error ) {
					// Don't let a DataTables init failure break the editor canvas.
					// eslint-disable-next-line no-console
					console.error( 'Gateway DataTable: failed to initialize.', error );
				}
				currentTable = table;
			} else if ( ! table && currentTable ) {
				destroyGatewayDataTable( currentTable );
				currentTable = null;
			}
		};

		// The preview may already be present (e.g. cached SSR response).
		syncTable();

		const observer = new window.MutationObserver( syncTable );
		observer.observe( container, { childList: true, subtree: true } );

		return () => {
			observer.disconnect();
			destroyGatewayDataTable( currentTable );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps );
}
