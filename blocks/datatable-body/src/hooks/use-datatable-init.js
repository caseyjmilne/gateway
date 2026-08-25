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
 *
 * This hook is only ever used from edit.js, never view.js -- so the row
 * -link suppression below is inherently editor-only; front-end row links
 * (e.g. a post's title, linked to its permalink) keep working normally
 * there.
 *
 * It's also the one place that needs to suppress DataTables' own default
 * widgets (pageLength/search/info/paging) *itself*, rather than leaving
 * that to each dedicated block's own view.js the way the front end does
 * (see shared/wait-for-datatable.js's hideNativeDataTableWidget() and its
 * callers in gateway/datatable-page-size, -search, gateway/pagination, and
 * gateway/datatable-results): view.js bundles are front-end-only --
 * block.json's "viewScript" is never loaded inside the editor -- so
 * nothing else ever calls that function against this editor-only
 * DataTable instance. Without it, this block's own preview showed the
 * full native pageLength/search/info/paging UI (DataTables' default
 * layout) alongside the dedicated blocks' own placeholder previews
 * elsewhere in the InnerBlocks tree, reading as duplicates -- reported as
 * "results and pagination still shows in the body section... duplicate
 * because we have our own version of these below in the footer".
 */

import { useEffect } from '@wordpress/element';
import { initGatewayDataTable, destroyGatewayDataTable } from '../../../shared/datatable';
import { hideNativeDataTableWidget } from '../../../shared/wait-for-datatable';

/**
 * Every native widget class DataTables' own default layout renders that a
 * dedicated Gateway block replaces (see each one's own view.js) -- kept
 * here as one list since, unlike the front end (where each replacement
 * block only knows about, and suppresses, its own one widget), this editor
 * -only preview has no per-block visibility into which of the four are
 * actually present elsewhere in the tree; it always has all of them, the
 * same way the front end always does once useRequiredInnerBlocks() /
 * `template` (gateway/datatable's own edit.js) have done their job.
 */
const NATIVE_WIDGET_CLASSES = [ 'dt-length', 'dt-search', 'dt-info', 'dt-paging' ];

/**
 * @param {Object} containerRef React ref to the element that will contain the rendered <table>.
 * @param {Array}  deps         Dependency array; re-runs (re-inits) whenever these change.
 */
export function useDataTableInit( containerRef, deps = [] ) {
	// Suppress clicks on row links (e.g. a post's title, linked to its
	// permalink in render.php) so they don't navigate the editor away from
	// the post being edited. Scoped to <tbody> specifically -- not the
	// whole container -- so DataTables' own UI (pagination controls, which
	// render outside the <table> element entirely) is never affected. This
	// is its own effect, independent of `deps`: event delegation means it
	// doesn't need to know about any specific table node, so it's set up
	// once and left running across re-renders/reinits rather than being
	// torn down and recreated alongside them.
	useEffect( () => {
		const container = containerRef.current;

		if ( ! container ) {
			return;
		}

		const suppressRowLinks = ( event ) => {
			const link = event.target.closest( 'a' );

			if ( link && link.closest( 'tbody' ) ) {
				event.preventDefault();
			}
		};

		container.addEventListener( 'click', suppressRowLinks );

		return () => {
			container.removeEventListener( 'click', suppressRowLinks );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

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
					NATIVE_WIDGET_CLASSES.forEach( ( widgetClass ) =>
						hideNativeDataTableWidget( table, widgetClass )
					);
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
