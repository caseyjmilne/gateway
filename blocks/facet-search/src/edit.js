import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, wired-up input only
 * exists on the front end (view.js), hooked into an actual DataTable
 * instance. No settings to configure, so no InspectorControls -- this
 * block searches every column, always; there's nothing to pick.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-facet-search' } );

	return (
		<div { ...blockProps }>
			<label className="gateway-facet-search__label">
				{ __( 'Search:', 'gateway' ) }
			</label>
			<input
				type="search"
				className="gateway-facet-search__input"
				disabled
			/>
		</div>
	);
}
