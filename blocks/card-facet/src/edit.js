import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, Spinner } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import FacetKeyControl from '../../shared/controls/facet-key-control';
import UiTypeControl from '../../shared/controls/ui-type-control';
import CompareControl from '../../shared/controls/compare-control';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useFacetOptions } from '../../shared/use-facet-options';

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

	// The real Select/Checkboxes options -- same discovered values
	// render.php's own Facet_Query::get_facet_options()/
	// get_facet_options_for_collection() call already uses on the front
	// end -- so this block's editor preview shows the SAME list for both
	// UI types, not a single static placeholder.
	const { options: facetOptions, isLoading: isLoadingFacetOptions } = useFacetOptions( {
		sourceType,
		postType,
		collection,
		facetKey,
		uiType,
	} );

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
						options={ facetOptions }
						isLoadingOptions={ isLoadingFacetOptions }
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
 * just to show what kind of control this will be. For Select/Checkboxes,
 * that now includes its actual options -- `options` (from
 * `useFacetOptions()`, fetched by `Edit()` above) is the SAME discovered
 * value list render.php's own `Facet_Query::get_facet_options()`/
 * `get_facet_options_for_collection()` call already builds for the front
 * end, not a placeholder.
 */
function FacetPreviewContent( { uiType, label, defaultValue, options, isLoadingOptions } ) {
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
				isLoadingOptions ? (
					<Spinner />
				) : (
					<select
						className="gateway-card-facet__select"
						disabled
						value={ defaultValue || '' }
						onChange={ () => {} }
					>
						<option value="">{ __( 'All', 'gateway' ) }</option>
						{ options.map( ( option ) => (
							<option key={ option.value } value={ option.value }>
								{ option.label }
							</option>
						) ) }
					</select>
				)
			) }
			{ 'checkboxes' === uiType && (
				isLoadingOptions ? (
					<Spinner />
				) : options.length ? (
					<div className="gateway-card-facet__checkboxes">
						{ options.map( ( option ) => (
							<label
								key={ option.value }
								className="gateway-card-facet__checkbox-label"
							>
								<input
									type="checkbox"
									disabled
									checked={ option.value === defaultValue }
									onChange={ () => {} }
								/>
								{ option.label }
							</label>
						) ) }
					</div>
				) : (
					<p className="gateway-card-facet__default-note">
						{ __( 'No values found for this field yet.', 'gateway' ) }
					</p>
				)
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
