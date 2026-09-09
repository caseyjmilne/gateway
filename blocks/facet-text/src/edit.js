import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * gateway/facet-has-value's own close sibling -- same "must also be a
 * currently displayed column" (`gateway/datatable/columns` context)
 * requirement, since a facet's DataTables column index is how the front
 * end (view.js) hooks into it. The one real difference: the eligibility
 * flag is `isTextRenderable` instead of `isHasValueEligible`, per a
 * direct request ("This should only show list of fields that have text").
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey } = attributes;
	const blockProps = useBlockProps( {
		className: 'gateway-facet gateway-facet-text',
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

	// Every field this type declares text-renderable AND currently a
	// displayed column -- see this component's own docblock for why both
	// gates apply here, unlike gateway/card-facet-text's own picker.
	const eligibleColumns = availableColumns.filter(
		( column ) => column.isTextRenderable && displayedKeys.has( column.key )
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

	// A field this type declares eligible but that isn't (or is no longer)
	// a displayed column -- distinct from "doesn't exist/isn't eligible at
	// all," so the notice below can point at the actual fix (add it as a
	// column) rather than a generic "choose another."
	const isEligibleButNotDisplayed =
		fieldKey &&
		! isFieldConfigured &&
		availableColumns.some(
			( column ) => column.key === fieldKey && column.isTextRenderable
		);

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Text Facet Settings', 'gateway' ) }>
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
					<>
						<span className="gateway-facet__label">{ label }</span>
						<input
							type="text"
							className="gateway-facet__input"
							disabled
							value=""
							placeholder={ sprintf(
								/* translators: %s: field label. */
								__( 'Filter by %s…', 'gateway' ),
								label
							) }
						/>
					</>
				) }
			</div>
		</>
	);
}
