import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * gateway/card-facet's own close sibling, but self-contained (its own
 * `fieldKey` attribute, not routed through the parent's pre-registered
 * `facets`) -- the same "isHasValueEligible, not isFilterable" reasoning
 * gateway/card-facet-has-value/src/edit.js's own docblock gives, just with
 * `isTextRenderable` as the eligibility flag instead, per a direct
 * request: "This should only show list of fields that have text... I
 * think we already have a field type function that describes this."
 *
 * No UI-type/compare pickers at all -- unlike gateway/card-facet, this
 * block is always exactly one thing: a text input doing a "contains"
 * search ('LIKE'), hardcoded in render.php.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey } = attributes;
	const blockProps = useBlockProps( {
		className: 'gateway-card-facet gateway-card-facet-text',
	} );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const postType = context[ 'gateway/data-cards/postType' ] || 'post';
	const collection = context[ 'gateway/data-cards/collection' ] || '';

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( postType, { sourceType, collection } );

	// Every field this type declares text-renderable -- see
	// Column_Registry's own `isTextRenderable` docblock for exactly which
	// types that includes (Text, Textarea, Email, URL, Number, Date/Time,
	// Select/Radio, ... -- never Password, WYSIWYG, Markdown, True/False).
	const eligibleColumns = availableColumns.filter(
		( column ) => column.isTextRenderable
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
					<>
						<span className="gateway-card-facet__label">{ label }</span>
						<input
							type="text"
							className="gateway-card-facet__input"
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
