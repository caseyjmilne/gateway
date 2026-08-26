import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- unlike the datatable-search family's
 * OWN static preview (which is static only until DataTables initializes
 * client-side), there's no live-instance-to-sync-with equivalent for this
 * block to ever reach in the editor at all: gateway/data-cards-body's own
 * editor preview is real InnerBlocks + useBlockPreview editing (see its
 * own edit.js), never a server-rendered `.gateway-data-cards-grid` --
 * that markup only ever exists on a real front-end/full-page render (see
 * render.php). Disabled here specifically (unlike render.php's real,
 * enabled input) so the editor doesn't show a field that looks
 * interactive but silently does nothing.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-search' } );

	return (
		<div { ...blockProps }>
			<label>{ __( 'Search:', 'gateway' ) }</label>
			<input
				type="search"
				className="gateway-data-cards-search__input"
				disabled
			/>
		</div>
	);
}
