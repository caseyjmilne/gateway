/**
 * Editor-only hook: keeps an `attach(table, dataTable)` callback wired to
 * whichever live DataTable instance is currently the sibling `gateway/
 * datatable-body`'s -- re-attaching whenever that instance is replaced
 * (e.g. `use-datatable-init.js` destroys and recreates it after a Post
 * Type or column-config change), and detaching if it disappears entirely
 * (e.g. `gateway/datatable-body` removed from the InnerBlocks tree).
 *
 * Used by gateway/pagination's (and any future block's) own editor
 * preview to make it *live* -- reflecting the real page count/results,
 * not a fixed placeholder unrelated to the table it sits next to -- the
 * same way `gateway/datatable-body`'s own editor preview already is (see
 * that block's use-datatable-init.js), just from a sibling block that
 * doesn't own the table itself.
 *
 * Polling, not a MutationObserver, deliberately: unlike `use-datatable
 * -init.js` (which watches one specific, *local* ref'd container it owns),
 * this hook has to find a sibling that can be several levels away in the
 * tree with no closer common container guaranteed between them -- a
 * MutationObserver broad enough to see it (e.g. the whole editor canvas
 * body) would fire far more often than this actually needs to check.
 * `waitForDataTable()` (shared/wait-for-datatable.js) already establishes
 * that a short interval poll is an acceptable, simple way to wait on
 * DataTables' own state in this codebase; this just keeps polling
 * indefinitely instead of giving up after one timeout, since "keep this
 * in sync for as long as the block is mounted" -- not "wait once" -- is
 * exactly what's needed here.
 */

import { useEffect, useRef } from '@wordpress/element';
import $ from 'jquery';
import { findDataTableElement } from './wait-for-datatable';

const POLL_INTERVAL_MS = 200;

/**
 * @param {Object}   containerRef React ref to an element inside the same `.gateway-datatable-block` as the table.
 * @param {Function} attach       ( table, dataTable ) => cleanup. Called with a live instance whenever one appears or is replaced; its returned cleanup is called before the next attach, and on unmount.
 */
export function useLiveDataTableSync( containerRef, attach ) {
	// `attach` is typically a fresh function identity every render (it
	// closes over the block's own props/attributes) -- reading it via a
	// ref, rather than putting it in the effect's own dependency array,
	// means a normal re-render doesn't tear down and re-poll from scratch;
	// only mount/unmount and `containerRef` itself do.
	const attachRef = useRef( attach );
	attachRef.current = attach;

	useEffect( () => {
		const container = containerRef.current;

		if ( ! container ) {
			return;
		}

		let cancelled = false;
		let currentTable = null;
		let cleanupAttach = null;
		let timeoutId = null;

		const detach = () => {
			if ( cleanupAttach ) {
				cleanupAttach();
				cleanupAttach = null;
			}

			currentTable = null;
		};

		const poll = () => {
			if ( cancelled ) {
				return;
			}

			const table = findDataTableElement( container );
			const isLive = Boolean(
				table &&
					$.fn.DataTable &&
					$.fn.DataTable.isDataTable &&
					$.fn.DataTable.isDataTable( table )
			);

			if ( isLive && table !== currentTable ) {
				detach();
				currentTable = table;
				cleanupAttach = attachRef.current( table, $( table ).DataTable() );
			} else if ( ! isLive && currentTable ) {
				detach();
			}

			timeoutId = setTimeout( poll, POLL_INTERVAL_MS );
		};

		poll();

		return () => {
			cancelled = true;
			clearTimeout( timeoutId );
			detach();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ containerRef ] );
}
