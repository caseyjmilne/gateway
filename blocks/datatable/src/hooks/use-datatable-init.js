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

		// Dim the preview immediately, rather than leaving the old table
		// fully visible until the moment it's torn down and replaced: a
		// full DOM swap (see below) happens instantly with no DOM state to
		// CSS-transition between, so without this the refresh reads as an
		// abrupt, jarring full repaint. `.is-refreshing` (style.scss) fades
		// the container out; cleared once the fresh table has (re)initialized,
		// letting it fade back in.
		container.classList.add( 'is-refreshing' );

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
				container.classList.remove( 'is-refreshing' );
			} else if ( ! table && currentTable ) {
				destroyGatewayDataTable( currentTable );
				currentTable = null;
			}
		};

		// Deliberately *not* calling syncTable() here. When this effect
		// re-runs because a dep changed (e.g. the column config), the table
		// still sitting in the DOM at this instant is the *previous*
		// render's markup -- <ServerSideRender> fetches its updated markup
		// asynchronously, so it hasn't landed yet. Initializing against it
		// now would apply stale settings (e.g. the old Sortable flags) to a
		// table that's about to be replaced anyway -- exactly the kind of
		// "the change doesn't seem to take effect in the editor" staleness
		// this hook needs to avoid. The MutationObserver below is the only
		// thing that should ever trigger a (re)init: it only fires once the
		// real, up-to-date markup has actually landed in the DOM.
		const observer = new window.MutationObserver( syncTable );
		observer.observe( container, { childList: true, subtree: true } );

		return () => {
			observer.disconnect();
			destroyGatewayDataTable( currentTable );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps );
}
