import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * This block's whole reason for existing is task (C) from the plugin's
 * own README ("an accurate list of only the available fields for that
 * model type"): its Field picker is fed by useAvailableColumns() called
 * with { sourceType: 'collection', collection } -- the same hook and the
 * same REST route (/gateway/v1/columns-for-collection/<class>, itself
 * backed by Model_Fields::all()) gateway/datatable and gateway/data-cards
 * already use for their own column/facet pickers -- so this list is
 * always exactly whichever fields the CURRENTLY-configured parent
 * Collection actually has, re-fetched automatically whenever that
 * changes, never a hardcoded or stale guess.
 *
 * The live text shown here is best-effort, not authoritative: `record`
 * (block context) is only ever populated when gateway/data-cards-body's
 * own edit.js has successfully fetched a preview record for the current
 * Collection (see that file's own docblock) -- absent that, this falls
 * back to showing the chosen field's label, so the block never renders
 * empty. The real, correct value is always what render.php prints on an
 * actual front-end/full-page render, straight off the real Eloquent
 * record injected via block context.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey } = attributes;
	const blockProps = useBlockProps( { className: 'gateway-card-field-text' } );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const record = context.record;
	const isCollection = 'collection' === sourceType;

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( '', { sourceType: 'collection', collection } );

	const options = [
		{ label: __( '— Select a field —', 'gateway' ), value: '' },
		...availableColumns.map( ( column ) => ( {
			label: column.label,
			value: column.key,
		} ) ),
	];

	const selectedColumn = availableColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );

	let previewText = __( '(no field selected)', 'gateway' );

	if ( fieldKey && isFieldConfigured ) {
		if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
			previewText = String( record[ fieldKey ] ?? '' );
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
							label={ __( 'Field', 'gateway' ) }
							value={ fieldKey }
							options={ options }
							disabled={ isLoading }
							help={ error || undefined }
							onChange={ ( value ) => setAttributes( { fieldKey: value } ) }
						/>
					) }
					{ isCollection && collection && fieldKey && ! isFieldConfigured && ! isLoading && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This field no longer exists on the selected Collection. Choose another.',
								'gateway'
							) }
						</Notice>
					) }
				</PanelBody>
			</InspectorControls>
			<span { ...blockProps }>{ previewText }</span>
		</>
	);
}
