import { useSelect } from '@wordpress/data';
import { useBlockProps, store as blockEditorStore } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import { buildInfoText } from '../../shared/results-text';
import { STORE_NAME as DATA_CARDS_PREVIEW_STORE } from '../../shared/store/data-cards-preview';

/**
 * A real preview once gateway/data-cards-body -- a SIBLING, not an
 * ancestor (see blocks/shared/store/data-cards-preview.js's own docblock
 * for why a shared store, not block context, is what carries this across)
 * -- has computed its own query results: reads that store, keyed by the
 * ancestor gateway/data-cards block's own clientId, and builds the same
 * "Showing X to Y of Z entries" text the real front end's own view.js
 * builds via the identical shared buildInfoText() helper. Falls back to
 * the original static placeholder text when no meta has been published
 * yet (the very first render, before -body's own effect runs).
 */
export default function Edit( { clientId } ) {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-results' } );

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

	return (
		<div { ...blockProps }>
			{ meta ? buildInfoText( meta ) : __( 'Showing 1 to 12 of 48 entries', 'gateway' ) }
		</div>
	);
}
