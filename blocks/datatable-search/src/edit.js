import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, wired-up input only
 * exists on the front end (view.js), hooked into an actual DataTable
 * instance (see gateway/facet's FacetPreviewContent for the same
 * reasoning). No settings to configure, so no InspectorControls.
 *
 * `className: 'gateway-datatable-search'` goes directly on
 * `useBlockProps()`, not a separate nested `<div>` -- see
 * `gateway/facet`'s own `edit.js` for why that distinction matters: a
 * nested element with its own layout rule doesn't reliably inherit
 * anything the outer, `useBlockProps()`-carried one gets, and matching
 * `render.php`'s one-wrapper structure keeps that from ever mattering
 * here in the first place.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-datatable-search' } );

	return (
		<div { ...blockProps }>
			<label>{ __( 'Search:', 'gateway' ) }</label>
			<input
				type="search"
				className="gateway-datatable-search__input"
				disabled
			/>
		</div>
	);
}
