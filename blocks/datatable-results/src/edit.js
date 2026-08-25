import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, live-updating text only
 * exists on the front end (view.js), hooked into an actual DataTable
 * instance (see gateway/facet's FacetPreview for the same reasoning). No
 * settings to configure, so no InspectorControls.
 */
export default function Edit() {
	const blockProps = useBlockProps();

	return (
		<div { ...blockProps }>
			<div className="gateway-datatable-results">
				{ __( 'Showing 1 to 10 of 20 entries', 'gateway' ) }
			</div>
		</div>
	);
}
