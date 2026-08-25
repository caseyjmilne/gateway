import { useBlockProps } from '@wordpress/block-editor';
import { useCallback, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { useLiveDataTableSync } from '../../shared/use-live-datatable-sync';
import { attachPageSize } from './attach-page-size';

/**
 * A *live* preview, not a static one: reported -- "we also need accurate
 * page sizer because when we add a smaller limit like '1' this normally
 * shows on the front-end because it was appended to the options... all
 * dynamic segments must operate the same in editor as they do on the
 * front-end." Same fix as `gateway/pagination`'s and `gateway/datatable
 * -results`' own editor previews (see "A live editor preview, not a
 * static one" in README.md): `gateway/datatable-body`'s own editor
 * preview already initializes a real, live DataTable instance;
 * `useLiveDataTableSync()` finds that same instance from here -- a
 * separate, sibling block -- and `attachPageSize()` (shared with the
 * front end's view.js) populates this block's `<select>` from that
 * instance's own real, already-merged `lengthMenu` (so a smaller
 * configured Page Size like `1` shows up here too, exactly like the front
 * end), and wires it to `page.len()` for real.
 *
 * `className: 'gateway-datatable-page-size'` goes directly on
 * `useBlockProps()` here, not on a separate nested `<div>` the way an
 * earlier version of this did -- see `gateway/facet`'s own `edit.js` for
 * why that distinction matters, beyond just matching `render.php`'s one
 * -wrapper structure: it's also the exact element `attachPageSize()`
 * queries into for its `<select>`.
 */
export default function Edit() {
	const containerRef = useRef();
	const blockProps = useBlockProps( {
		className: 'gateway-datatable-page-size',
		ref: containerRef,
	} );

	const attach = useCallback(
		( table, dataTable ) => attachPageSize( containerRef.current, table, dataTable ),
		[]
	);

	useLiveDataTableSync( containerRef, attach );

	return (
		<div { ...blockProps }>
			<select className="gateway-datatable-page-size__select" disabled></select>
			<label>{ __( 'entries per page', 'gateway' ) }</label>
		</div>
	);
}
