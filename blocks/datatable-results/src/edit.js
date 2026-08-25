import { useBlockProps } from '@wordpress/block-editor';
import { useCallback, useRef } from '@wordpress/element';

import { useLiveDataTableSync } from '../../shared/use-live-datatable-sync';
import { attachResults } from './attach-results';

/**
 * A *live* preview, not a static one: reported alongside the hardcoded
 * pagination preview -- "fix hardcoded Showing 1 to 10 of 20 entries so it
 * shows the accurate statement... driven by DataTables". Same fix as
 * `gateway/pagination`'s own editor preview (see "A live editor preview,
 * not a static one" in README.md): `gateway/datatable-body`'s own editor
 * preview already initializes a real, live DataTable instance;
 * `useLiveDataTableSync()` finds that same instance from here -- a
 * separate, sibling block -- and `attachResults()` (shared with the front
 * end's view.js) keeps this block's own text in sync with it for real.
 *
 * `className: 'gateway-datatable-results'` goes directly on `useBlockProps()`
 * here, not on a separate nested `<div>` the way an earlier version of this
 * (and `gateway/facet`'s own `edit.js`, before its similar fix) did -- see
 * `gateway/facet`'s own `edit.js` for why that distinction actually
 * matters, beyond just matching `render.php`'s one-wrapper structure: it's
 * also the exact element `attachResults()` writes its text into.
 */
export default function Edit() {
	const containerRef = useRef();
	const blockProps = useBlockProps( {
		className: 'gateway-datatable-results',
		ref: containerRef,
	} );

	const attach = useCallback(
		( table, dataTable ) => attachResults( containerRef.current, table, dataTable ),
		[]
	);

	useLiveDataTableSync( containerRef, attach );

	return <div { ...blockProps } />;
}
