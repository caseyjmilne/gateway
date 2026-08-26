import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- see gateway/data-cards-search's own
 * edit.js docblock for why: there's no live-instance-to-sync-with
 * equivalent for gateway/data-cards to reach in the editor at all.
 * Representative placeholder text only -- the real counts only exist on a
 * real front-end/full-page render (see render.php).
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-results' } );

	return (
		<div { ...blockProps }>
			{ __( 'Showing 1 to 12 of 48 entries', 'gateway' ) }
		</div>
	);
}
