import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, populated <select> only
 * exists on the front end (view.js), hooked into an actual DataTable
 * instance (see gateway/facet's FacetPreview for the same reasoning). No
 * settings to configure, so no InspectorControls.
 */
export default function Edit() {
	const blockProps = useBlockProps();

	return (
		<div { ...blockProps }>
			<div className="gateway-datatable-page-size">
				<select className="gateway-datatable-page-size__select" disabled>
					<option>10</option>
					<option>25</option>
					<option>50</option>
					<option>100</option>
				</select>
				<label>{ __( 'entries per page', 'gateway' ) }</label>
			</div>
		</div>
	);
}
