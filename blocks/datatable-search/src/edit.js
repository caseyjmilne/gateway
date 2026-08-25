import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, wired-up input only
 * exists on the front end (view.js), hooked into an actual DataTable
 * instance (see gateway/facet's FacetPreview for the same reasoning). No
 * settings to configure, so no InspectorControls.
 */
export default function Edit() {
	const blockProps = useBlockProps();

	return (
		<div { ...blockProps }>
			<div className="gateway-datatable-search">
				<label>{ __( 'Search:', 'gateway' ) }</label>
				<input
					type="search"
					className="gateway-datatable-search__input"
					disabled
				/>
			</div>
		</div>
	);
}
