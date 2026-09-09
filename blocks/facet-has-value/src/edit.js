import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl, TextControl, ToggleControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * gateway/facet's own close sibling, but self-contained -- same
 * "isHasValueEligible, not isFilterable" reasoning as gateway/card-facet
 * -has-value/src/edit.js's own docblock, PLUS the one thing that block
 * doesn't need at all: the field must also be a currently displayed
 * column (`gateway/datatable/columns` context), since a facet's DataTables
 * column index is how the front end (view.js) hooks into it -- the same
 * requirement gateway/facet's own edit.js already enforces for its own
 * (parent-registered) facets.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey, displayAsCheckbox, title } = attributes;
	const blockProps = useBlockProps( {
		className: 'gateway-facet gateway-facet-has-value',
	} );

	const sourceType = context[ 'gateway/datatable/sourceType' ] || 'postType';
	const postType = context[ 'gateway/datatable/postType' ] || 'post';
	const collection = context[ 'gateway/datatable/collection' ] || '';
	const parentColumns = context[ 'gateway/datatable/columns' ] || [];

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( postType, { sourceType, collection } );

	const displayedKeys = new Set( parentColumns.map( ( column ) => column.key ) );

	// Every field this type declares eligible AND currently a displayed
	// column -- see this component's own docblock for why both gates
	// apply here, unlike gateway/card-facet-has-value's own picker.
	const eligibleColumns = availableColumns.filter(
		( column ) => column.isHasValueEligible && displayedKeys.has( column.key )
	);

	const options = [
		{ label: __( '— Select a field —', 'gateway' ), value: '' },
		...eligibleColumns.map( ( column ) => ( {
			label: column.label,
			value: column.key,
		} ) ),
	];

	const selectedColumn = eligibleColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );
	const label = selectedColumn ? selectedColumn.label : fieldKey;
	const defaultText = sprintf(
		/* translators: %s: field label. */
		__( 'Has %s', 'gateway' ),
		label
	);
	// See gateway/card-facet-has-value's own edit.js comment on this same
	// pattern -- a site owner's override, falling back to the live default
	// (tracking the field's own label/rename) whenever Title is blank.
	const displayText = title || defaultText;

	// A field this type declares eligible but that isn't (or is no longer)
	// a displayed column -- distinct from "doesn't exist/isn't eligible at
	// all," so the notice below can point at the actual fix (add it as a
	// column) rather than a generic "choose another."
	const isEligibleButNotDisplayed =
		fieldKey &&
		! isFieldConfigured &&
		availableColumns.some(
			( column ) => column.key === fieldKey && column.isHasValueEligible
		);

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Has Value Facet Settings', 'gateway' ) }>
					<SelectControl
						label={ __( 'Field', 'gateway' ) }
						value={ fieldKey }
						options={ options }
						disabled={ isLoading }
						onChange={ ( value ) => setAttributes( { fieldKey: value } ) }
					/>
					{ error && (
						<Notice status="error" isDismissible={ false }>
							{ error }
						</Notice>
					) }
					<ToggleControl
						label={ __( 'Display as Checkbox', 'gateway' ) }
						help={ __(
							'Off shows a toggle switch (the default). On shows a plain checkbox instead.',
							'gateway'
						) }
						checked={ Boolean( displayAsCheckbox ) }
						onChange={ ( value ) =>
							setAttributes( { displayAsCheckbox: value } )
						}
					/>
					<TextControl
						label={ __( 'Title', 'gateway' ) }
						help={ __(
							'Overrides the default label. Leave blank to keep using it.',
							'gateway'
						) }
						value={ title }
						placeholder={ defaultText }
						onChange={ ( value ) => setAttributes( { title: value } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...blockProps }>
				{ ! fieldKey && (
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Select a field in the sidebar to configure this filter.',
							'gateway'
						) }
					</Notice>
				) }
				{ fieldKey && isEligibleButNotDisplayed && (
					<Notice status="warning" isDismissible={ false }>
						{ sprintf(
							/* translators: %s: field label/key. */
							__(
								'“%s” isn’t currently a displayed column, so this filter has nothing to hook into on the front end. Add it as a column under the Data Table block’s Columns settings.',
								'gateway'
							),
							fieldKey
						) }
					</Notice>
				) }
				{ fieldKey && ! isFieldConfigured && ! isEligibleButNotDisplayed && ! isLoading && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'This field no longer exists (or is no longer eligible). Choose another.',
							'gateway'
						) }
					</Notice>
				) }
				{ fieldKey && isFieldConfigured && (
					<label
						className={
							'gateway-facet-has-value__control gateway-facet-has-value__control--' +
							( displayAsCheckbox ? 'checkbox' : 'toggle' )
						}
					>
						<input
							type="checkbox"
							className="gateway-facet-has-value__checkbox"
							disabled
							onChange={ () => {} }
						/>
						{ ! displayAsCheckbox && (
							<span
								className="gateway-facet-has-value__toggle-slider"
								aria-hidden="true"
							/>
						) }
						<span className="gateway-facet-has-value__control-text">
							{ displayText }
						</span>
					</label>
				) }
			</div>
		</>
	);
}
