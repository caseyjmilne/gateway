import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- same reasoning as gateway/
 * data-cards-search's own edit.js: there's no live `.gateway-data-cards-grid`
 * to fetch against in the editor at all (gateway/data-cards-body's own
 * editor preview is real InnerBlocks + useBlockPreview editing, never a
 * server-rendered grid), so the real, enabled input only ever exists on
 * the front end (render.php + view.js). No settings to configure, so no
 * InspectorControls -- this block searches every field, always; there's
 * nothing to pick.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-card-facet-search' } );

	return (
		<div { ...blockProps }>
			<label className="gateway-card-facet-search__label">
				{ __( 'Search:', 'gateway' ) }
			</label>
			<input
				type="search"
				className="gateway-card-facet-search__input"
				disabled
			/>
		</div>
	);
}
