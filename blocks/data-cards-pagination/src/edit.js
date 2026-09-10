import { useSelect } from '@wordpress/data';
import { useBlockProps, store as blockEditorStore } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import { getPageWindow } from '../../shared/pagination-window';
import { STORE_NAME as DATA_CARDS_PREVIEW_STORE } from '../../shared/store/data-cards-preview';

/**
 * The exact same static markup this block always rendered -- kept as the
 * fallback for whenever no real preview meta has been published yet (the
 * very first render, before gateway/data-cards-body's own effect runs, or
 * this block sitting outside a gateway/data-cards tree at all). Cheap,
 * already-styled, and avoids a blank box.
 */
function StaticPreview( { blockProps } ) {
	return (
		<nav { ...blockProps } aria-label={ __( 'Grid pagination', 'gateway' ) }>
			<button type="button" className="gateway-data-cards-pagination__prev" disabled>
				{ __( 'Previous', 'gateway' ) }
			</button>
			<span className="gateway-data-cards-pagination__pages">
				{ [ 1, 2, 3 ].map( ( page ) => (
					<button
						key={ page }
						type="button"
						className={
							1 === page
								? 'gateway-data-cards-pagination__page is-current'
								: 'gateway-data-cards-pagination__page'
						}
						disabled
					>
						{ page }
					</button>
				) ) }
			</span>
			<button type="button" className="gateway-data-cards-pagination__next" disabled>
				{ __( 'Next', 'gateway' ) }
			</button>
		</nav>
	);
}

/**
 * A real preview once gateway/data-cards-body -- a SIBLING, not an
 * ancestor (both are children of the same parent gateway/data-cards
 * block; see blocks/shared/store/data-cards-preview.js's own docblock
 * for why a shared store, not block context, is what carries this
 * across) -- has computed its own query results. Reads that store,
 * keyed by the ancestor gateway/data-cards block's own clientId, and
 * builds the same Previous/page-number/Next buttons the real front end's
 * own view.js builds via the identical shared getPageWindow() helper --
 * never interactive here, though (this is the editor's own page-1-only
 * preview; real pagination only exists on the front end, same as before
 * this fix -- only the NUMBERS were wrong, not the lack of interactivity).
 */
export default function Edit( { clientId } ) {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-pagination' } );

	const dataCardsClientId = useSelect(
		( select ) =>
			select( blockEditorStore ).getBlockParentsByBlockName(
				clientId,
				'gateway/data-cards'
			)[ 0 ],
		[ clientId ]
	);

	const meta = useSelect(
		( select ) =>
			dataCardsClientId
				? select( DATA_CARDS_PREVIEW_STORE ).getPreviewMeta( dataCardsClientId )
				: undefined,
		[ dataCardsClientId ]
	);

	if ( ! meta ) {
		return <StaticPreview blockProps={ blockProps } />;
	}

	const { page, pages } = meta;

	return (
		<nav { ...blockProps } aria-label={ __( 'Grid pagination', 'gateway' ) }>
			<button type="button" className="gateway-data-cards-pagination__prev" disabled>
				{ __( 'Previous', 'gateway' ) }
			</button>
			<span className="gateway-data-cards-pagination__pages">
				{ getPageWindow( page, pages ).map( ( entry ) =>
					'ellipsis-start' === entry || 'ellipsis-end' === entry ? (
						<span
							key={ entry }
							className="gateway-data-cards-pagination__ellipsis"
							aria-hidden="true"
						>
							…
						</span>
					) : (
						<button
							key={ entry }
							type="button"
							className={
								entry === page
									? 'gateway-data-cards-pagination__page is-current'
									: 'gateway-data-cards-pagination__page'
							}
							aria-current={ entry === page ? 'page' : undefined }
							disabled
						>
							{ entry + 1 }
						</button>
					)
				) }
			</span>
			<button type="button" className="gateway-data-cards-pagination__next" disabled>
				{ __( 'Next', 'gateway' ) }
			</button>
		</nav>
	);
}
