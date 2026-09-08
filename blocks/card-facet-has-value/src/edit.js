import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * gateway/card-facet's own close sibling, but self-contained: this
 * block's own Field picker offers every `isHasValueEligible` field
 * directly (Column_Registry's own flag, deliberately broader than
 * `isFilterable` -- see that flag's own docblock, and render.php's own
 * docblock for why: "any fields the user makes from the available field
 * types is suitable"), rather than being scoped to whatever the parent's
 * own Facets panel already has registered the way gateway/card-facet is.
 * No "is this still configured on the parent" notice as a result -- there
 * is no parent-level registration step to fall out of sync with; the
 * usual "field no longer exists" re-validation (render.php, against
 * live current config) still applies.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey } = attributes;
	const blockProps = useBlockProps( {
		className: 'gateway-card-facet gateway-card-facet-has-value',
	} );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const postType = context[ 'gateway/data-cards/postType' ] || 'post';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const isCollection = 'collection' === sourceType;

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( postType, { sourceType, collection } );

	// Every field this type declares eligible -- see Column_Registry's own
	// `isHasValueEligible` docblock for exactly which types/columns that
	// excludes (the synthetic id/ID column always; a Collection field
	// whose type owns no real column, e.g. Relate To Many; postType
	// taxonomy/thumbnail columns).
	const eligibleColumns = availableColumns.filter(
		( column ) => column.isHasValueEligible
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
					{ ! isLoading && ! error && fieldKey && ! isFieldConfigured && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This field no longer exists (or is no longer eligible). Choose another.',
								'gateway'
							) }
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
				{ fieldKey && isFieldConfigured && (
					<label className="gateway-card-facet__checkbox-label">
						<input
							type="checkbox"
							disabled
							onChange={ () => {} }
						/>
						{ sprintf(
							/* translators: %s: field label. */
							__( 'Has %s', 'gateway' ),
							label
						) }
					</label>
				) }
			</div>
		</>
	);
}
