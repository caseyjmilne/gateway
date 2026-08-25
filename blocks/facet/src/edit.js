import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import FacetKeyControl from './controls/facet-key-control';
import UiTypeControl from './controls/ui-type-control';
import CompareControl from './controls/compare-control';
import { useAvailableColumns } from '../../shared/use-available-columns';

export default function Edit( { attributes, setAttributes, context } ) {
	const { facetKey, uiType, compare } = attributes;
	const blockProps = useBlockProps();

	const postType = context[ 'gateway/datatable/postType' ] || 'post';
	const parentFacets = context[ 'gateway/datatable/facets' ] || [];
	const parentColumns = context[ 'gateway/datatable/columns' ] || [];

	// Fetched purely to resolve a friendly label for the facet -- context
	// only carries the parent's raw attribute values (key/compare/value,
	// key/sortable), not the resolved labels Column_Registry provides.
	const { availableColumns } = useAvailableColumns( postType );
	const labelsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column.label;
		return acc;
	}, {} );

	const matchedFacet = parentFacets.find(
		( facet ) => facet.key === facetKey
	);
	const isFacetConfigured = Boolean( matchedFacet );
	const isDisplayedColumn = parentColumns.some(
		( column ) => column.key === facetKey
	);
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
							'This facet is no longer configured on the Data Table block. Select another, or re-add it under the Data Table block’s Facets settings.',
							'gateway'
						) }
					</Notice>
				) }
				{ facetKey && isFacetConfigured && ! isDisplayedColumn && (
					<Notice status="warning" isDismissible={ false }>
						{ sprintf(
							/* translators: %s: field label. */
							__(
								'“%s” isn’t currently a displayed column, so this filter has nothing to hook into on the front end. Add it as a column under the Data Table block’s Columns settings.',
								'gateway'
							),
							label
						) }
					</Notice>
				) }
				{ facetKey && isFacetConfigured && isDisplayedColumn && (
					<FacetPreview
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
 * A static, non-functional preview of the chosen control -- the real,
 * interactive version only exists on the front end (view.js), hooked into
 * an actual DataTable instance; the editor's job here is just to show what
 * kind of control this will be, not to simulate visitor interaction.
 *
 * `defaultValue` is the parent's preset value for this facet (Facets panel),
 * shown pre-filled here the same way render.php pre-fills the real control
 * on the front end -- so a site owner sees, while editing, that the table
 * is already narrowed by that preset, not just once the page is published.
 */
function FacetPreview( { uiType, label, defaultValue } ) {
	return (
		<div className={ `gateway-facet gateway-facet--${ uiType }` }>
			<span className="gateway-facet__label">{ label }</span>
			{ 'input' === uiType && (
				<input
					type="text"
					className="gateway-facet__input"
					disabled
					value={ defaultValue }
					placeholder={ __( 'Filter…', 'gateway' ) }
				/>
			) }
			{ 'select' === uiType && (
				<select className="gateway-facet__select" disabled>
					<option>{ defaultValue || __( 'All', 'gateway' ) }</option>
				</select>
			) }
			{ 'checkboxes' === uiType && (
				<div className="gateway-facet__checkboxes">
					<label className="gateway-facet__checkbox-label">
						<input type="checkbox" disabled checked={ Boolean( defaultValue ) } />
						{ defaultValue || __( 'Example value', 'gateway' ) }
					</label>
				</div>
			) }
			{ defaultValue && (
				<p className="gateway-facet__default-note">
					{ sprintf(
						/* translators: %s: preset filter value. */
						__(
							'Pre-filtered to “%s” by the Data Table block’s Facets setting.',
							'gateway'
						),
						defaultValue
					) }
				</p>
			) }
		</div>
	);
}
