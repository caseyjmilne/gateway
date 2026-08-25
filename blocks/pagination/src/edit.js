import { useBlockProps } from '@wordpress/block-editor';
import { useCallback, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { useLiveDataTableSync } from '../../shared/use-live-datatable-sync';
import { attachPagination } from './attach-pagination';

/**
 * A *live* preview (this block was the first of this family -- Page Size,
 * Search, Results -- to become one): reported as "pagination in editor
 * always shows 3 pages even when the real number would be different --
 * isn't reading the actual page size at all", because an earlier version
 * hardcoded exactly that -- three fake page-number buttons, unrelated to
 * any real table. `gateway/datatable-body`'s own editor preview already
 * initializes a real, live DataTable instance for its <ServerSideRender>
 * output (see its use-datatable-init.js); useLiveDataTableSync() finds
 * that same instance from here -- a separate, sibling block -- and
 * attachPagination() (shared with the front end's view.js) wires this
 * block's own Previous/Next/page-number buttons to it for real, the same
 * way the front end does. The result: correct page counts, correct
 * disabled states, and clicking through actually pages the live preview
 * -- not a simulation of what it might look like.
 *
 * Renders the same empty skeleton render.php does (Previous/Next buttons,
 * an empty page-number container) rather than any placeholder numbers, for
 * the same reason render.php does: the real state only exists once
 * useLiveDataTableSync() finds a live instance to attach to.
 */
export default function Edit() {
	const navRef = useRef();
	const blockProps = useBlockProps( {
		className: 'gateway-pagination',
		ref: navRef,
	} );

	const attach = useCallback(
		( table, dataTable ) => attachPagination( navRef.current, table, dataTable ),
		[]
	);

	useLiveDataTableSync( navRef, attach );

	return (
		<nav { ...blockProps } aria-label={ __( 'Table pagination', 'gateway' ) }>
			<button type="button" className="gateway-pagination__prev" disabled>
				{ __( 'Previous', 'gateway' ) }
			</button>
			<span className="gateway-pagination__pages" />
			<button type="button" className="gateway-pagination__next" disabled>
				{ __( 'Next', 'gateway' ) }
			</button>
		</nav>
	);
}
