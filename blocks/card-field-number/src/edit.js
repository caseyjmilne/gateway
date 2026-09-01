import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';
import { formatNumber } from '../../shared/number-format';
import NumberFormatControls from '../../shared/controls/number-format-controls';

/**
 * Structurally the same as gateway/card-field-text/src/edit.js -- same
 * `useAvailableColumns()` fetch, same context-reading caveats (see that
 * file's own docblock for the full "synthetic wrapper block" reasoning
 * this shares verbatim: `record` in context is only ever a real preview
 * record when a parent block has actually fetched one, so this falls
 * back to a plain, unformatted field label rather than rendering empty).
 * The two real differences: the Field picker is filtered to
 * `isNumeric` instead of `isTextRenderable` (so choosing a Text field
 * here is never even offered -- Number_Formatter::format() has nothing
 * sensible to do with one), and a second Inspector section
 * (`NumberFormatControls`, shared with gateway/datatable's own per
 * -column Format modal) configures this block's own `numberFormat`
 * attribute -- Style/Decimal Places/Thousands Separator/Currency Symbol
 * /Position, with a live preview line.
 *
 * Unlike gateway/card-field-text, related fields aren't split out under
 * their own disabled "Related Fields" heading here -- Number fields are
 * numerous enough less often, both on a model itself and especially
 * through a relationship, that the extra visual grouping isn't earning
 * its own keep the way it does for card-field-text's much longer,
 * commonly-related-heavy field list; they're simply included inline
 * alongside the model's own numeric fields, each still labeled with its
 * own related-model prefix (Column_Registry::get_related_columns_for_collection()'s
 * own "Vendor: Commission Rate" label shape) so it's still clear which
 * ones come from a relationship.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey, numberFormat } = attributes;
	const blockProps = useBlockProps( { className: 'gateway-card-field-number' } );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const record = context.record;
	const isCollection = 'collection' === sourceType;

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( '', { sourceType: 'collection', collection } );

	// Only a field whose own type declares itself isNumeric -- see
	// gateway/card-field-text/src/edit.js's own identical reasoning for
	// isTextRenderable, just against the numeric flag instead: a Text
	// field's own value has nothing for Number_Formatter::format() to
	// meaningfully format, so it's never even offered here.
	const numericColumns = availableColumns.filter(
		( column ) => true === column.isNumeric
	);

	const options = [
		{ label: __( '— Select a field —', 'gateway' ), value: '' },
		...numericColumns.map( ( column ) => ( {
			label: column.label,
			value: column.key,
		} ) ),
	];

	const selectedColumn = numericColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );

	let previewText = __( '(no field selected)', 'gateway' );

	if ( fieldKey && isFieldConfigured ) {
		if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
			const formatted = formatNumber( record[ fieldKey ], numberFormat );
			previewText = '' !== formatted ? formatted : selectedColumn.label;
		} else {
			previewText = selectedColumn.label;
		}
	}

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Field Settings', 'gateway' ) }>
					{ ! isCollection && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This block only displays a value when the Data Cards block’s Source is set to Collection.',
								'gateway'
							) }
						</Notice>
					) }
					{ isCollection && ! collection && (
						<Notice status="info" isDismissible={ false }>
							{ __( 'Choose a Collection on the Data Cards block first.', 'gateway' ) }
						</Notice>
					) }
					{ isCollection && collection && (
						<SelectControl
							__nextHasNoMarginBottom
							label={ __( 'Field', 'gateway' ) }
							value={ fieldKey }
							options={ options }
							disabled={ isLoading }
							help={ error || undefined }
							onChange={ ( value ) => setAttributes( { fieldKey: value } ) }
						/>
					) }
					{ isCollection && collection && ! isLoading && numericColumns.length === 0 && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This Collection has no Number fields yet -- add one on its own Fields tab first.',
								'gateway'
							) }
						</Notice>
					) }
					{ isCollection && collection && fieldKey && ! isFieldConfigured && ! isLoading && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This field no longer exists (or is no longer a Number field) on the selected Collection. Choose another.',
								'gateway'
							) }
						</Notice>
					) }
				</PanelBody>
				<PanelBody title={ __( 'Number Format', 'gateway' ) } initialOpen={ false }>
					<NumberFormatControls
						format={ numberFormat }
						onChange={ ( nextFormat ) => setAttributes( { numberFormat: nextFormat } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<span { ...blockProps }>{ previewText }</span>
		</>
	);
}
