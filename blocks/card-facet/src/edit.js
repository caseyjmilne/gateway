import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import FacetKeyControl from '../../shared/controls/facet-key-control';
import UiTypeControl from '../../shared/controls/ui-type-control';
import CompareControl from '../../shared/controls/compare-control';
import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * A trimmed gateway/facet/src/edit.js: the "isn't currently a displayed
 * column" notice/check has no counterpart here (gateway/card-facet has
 * no columns concept at all -- see render.php's own docblock), so this
 * only ever checks "is a facet chosen" and "is it still configured on
 * the parent." `UiTypeControl` gets the selected field's own `facetType`
 * (from Column_Registry, via useAvailableColumns()) so it only offers UI
 * types that make sense for that field.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { facetKey, uiType, compare } = attributes;
	// The same classes render.php gives its own wrapper `<div>`, on this
	// one directly -- see gateway/facet's own edit.js for why that
	// distinction matters for the native font-size control.
	const blockProps = useBlockProps( {
		className: `gateway-card-facet gateway-card-facet--${ uiType }`,
	} );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const postType = context[ 'gateway/data-cards/postType' ] || 'post';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const parentFacets = context[ 'gateway/data-cards/facets' ] || [];

	const { availableColumns } = useAvailableColumns( postType, { sourceType, collection } );
	const labelsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column.label;
		return acc;
	}, {} );
	const facetTypesByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column.facetType;
		return acc;
	}, {} );

	const matchedFacet = parentFacets.find(
		( facet ) => facet.key === facetKey
	);
	const isFacetConfigured = Boolean( matchedFacet );
	const label = labelsByKey[ facetKey ] || facetKey;
	const defaultValue = matchedFacet ? matchedFacet.value : '';

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Facet Settings', 'gateway' ) }>
					<FacetKeyControl
						facets={ parentFacets }
						labelsByKey={ labelsByKey }
						value={ facetKey }
						onChange={ ( value ) =>
							setAttributes( { facetKey: value } )
						}
					/>
					<UiTypeControl
						value={ uiType }
						allowedTypes={ facetTypesByKey[ facetKey ] }
						onChange={ ( value ) =>
							setAttributes( { uiType: value } )
						}
					/>
					{ 'input' === uiType && (
						<CompareControl
							value={ compare }
							onChange={ ( value ) =>
								setAttributes( { compare: value } )
							}
						/>
					) }
				</PanelBody>
			</InspectorControls>
			<div { ...blockProps }>
				{ ! facetKey && (
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Select a facet in the sidebar to configure this filter.',
							'gateway'
						) }
					</Notice>
				) }
				{ facetKey && ! isFacetConfigured && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'This facet is no longer configured on the Data Cards block. Select another, or re-add it under the Data Cards block’s Facets settings.',
							'gateway'
						) }
					</Notice>
				) }
				{ facetKey && isFacetConfigured && (
					<FacetPreviewContent
						uiType={ uiType }
						label={ label }
						defaultValue={ defaultValue }
					/>
				) }
			</div>
		</>
	);
}

/**
 * A static, non-functional preview of the chosen control's *contents* --
 * the real, interactive version only exists on the front end (view.js),
 * driving a REST refetch of the sibling grid; the editor's job here is
 * just to show what kind of control this will be.
 */
function FacetPreviewContent( { uiType, label, defaultValue } ) {
	return (
		<>
			<span className="gateway-card-facet__label">{ label }</span>
			{ 'input' === uiType && (
				<input
					type="text"
					className="gateway-card-facet__input"
					disabled
					value={ defaultValue }
					placeholder={ __( 'Filter…', 'gateway' ) }
				/>
			) }
			{ 'select' === uiType && (
				<select className="gateway-card-facet__select" disabled>
					<option>{ defaultValue || __( 'All', 'gateway' ) }</option>
				</select>
			) }
			{ 'checkboxes' === uiType && (
				<div className="gateway-card-facet__checkboxes">
					<label className="gateway-card-facet__checkbox-label">
						<input type="checkbox" disabled checked={ Boolean( defaultValue ) } />
						{ defaultValue || __( 'Example value', 'gateway' ) }
					</label>
				</div>
			) }
			{ defaultValue && (
				<p className="gateway-card-facet__default-note">
					{ sprintf(
						/* translators: %s: preset filter value. */
						__(
							'Pre-filtered to “%s” by the Data Cards block’s Facets setting.',
							'gateway'
						),
						defaultValue
					) }
				</p>
			) }
		</>
	);
}
