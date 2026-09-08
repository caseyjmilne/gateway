import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl, ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * gateway/card-field-text's own close sibling -- same `useAvailableColumns()`
 * fetch, same context-reading caveats (see that block's own docblock for
 * the full "synthetic wrapper block" reasoning, verbatim here too), same
 * "field no longer exists" re-validation. The one real difference: the
 * Field picker is filtered to `isEmailRenderable` (`Field_Type::
 * is_email_renderable()`, true only for `Email_Field_Type` today -- see
 * that interface method's own docblock for why this is a separate,
 * ADDITIVE flag alongside `isTextRenderable` rather than a replacement
 * for it, the same way `isNumeric` sits alongside it for Number/Range),
 * and a second attribute, `useMailtoLink`, adds an optional `mailto:`
 * link render.php builds server-side -- per a direct request, "toggle to
 * use mailto to create a link, by default this is turned off and only
 * text is displayed."
 *
 * The live preview mirrors that toggle here too (best-effort, not
 * authoritative -- see gateway/card-field-text's own docblock for why:
 * `record` is only ever populated once gateway/data-cards-body's own
 * edit.js has fetched a preview record, and even then this never
 * replicates render.php's own `antispambot()` obfuscation, which only
 * matters for the real front end's own scraper-resistance, not this
 * editor-only preview).
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey, useMailtoLink } = attributes;
	// `display: inline-block` -- see gateway/card-field-text's own
	// docblock for why a plain `<span>`'s own browser-default `inline`
	// would otherwise silently swallow this block's own Margin/Padding
	// support.
	const blockProps = useBlockProps( {
		className: 'gateway-card-field-email',
		style: { display: 'inline-block' },
	} );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const record = context.record;
	const isCollection = 'collection' === sourceType;

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( '', { sourceType: 'collection', collection } );

	// Only a field whose own type declares itself isEmailRenderable --
	// see this component's own docblock for why that's a separate flag
	// from isTextRenderable, not a replacement for it.
	const renderableColumns = availableColumns.filter(
		( column ) => true === column.isEmailRenderable
	);

	// Same "Related Fields" grouping gateway/card-field-text's own picker
	// already uses -- a hasOne/belongsTo relationship's own Email field
	// (Column_Registry::get_related_columns_for_collection(), type
	// 'model_related_field') is kept together at the end of this flat
	// list, under its own disabled divider option.
	const ownColumns = renderableColumns.filter(
		( column ) => 'model_related_field' !== column.type
	);
	const relatedColumns = renderableColumns.filter(
		( column ) => 'model_related_field' === column.type
	);

	const options = [
		{ label: __( '— Select a field —', 'gateway' ), value: '' },
		...ownColumns.map( ( column ) => ( {
			label: column.label,
			value: column.key,
		} ) ),
		...( relatedColumns.length > 0
			? [
					{
						label: __( '── Related Fields ──', 'gateway' ),
						value: '__related_fields_heading__',
						disabled: true,
					},
					...relatedColumns.map( ( column ) => ( {
						label: column.label,
						value: column.key,
					} ) ),
			  ]
			: [] ),
	];

	// Checked against renderableColumns, not the full availableColumns --
	// a field configured before this block started declaring
	// isEmailRenderable (or one whose type changed away from Email
	// since) must show the same "no longer exists" style warning below
	// as a genuinely removed field.
	const selectedColumn = renderableColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );

	let previewText = __( '(no field selected)', 'gateway' );

	if ( fieldKey && isFieldConfigured ) {
		if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
			previewText = String( record[ fieldKey ] ?? '' );
		} else {
			previewText = selectedColumn.label;
		}
	}

	const hasRealPreviewValue =
		fieldKey &&
		isFieldConfigured &&
		record &&
		Object.prototype.hasOwnProperty.call( record, fieldKey );

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
					{ isCollection && collection && ! isLoading && renderableColumns.length === 0 && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This Collection has no Email fields yet -- add one on its own Fields tab first.',
								'gateway'
							) }
						</Notice>
					) }
					{ isCollection && collection && fieldKey && ! isFieldConfigured && ! isLoading && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This field no longer exists (or is no longer an Email field) on the selected Collection. Choose another.',
								'gateway'
							) }
						</Notice>
					) }
				</PanelBody>
				{ isFieldConfigured && (
					<PanelBody title={ __( 'Link Settings', 'gateway' ) }>
						<ToggleControl
							label={ __( 'Link as mailto:', 'gateway' ) }
							help={ __(
								'Off by default -- shows the address as plain text. When on, it becomes a clickable mailto: link (and is obfuscated against simple scrapers on the front end).',
								'gateway'
							) }
							checked={ Boolean( useMailtoLink ) }
							onChange={ ( checked ) => setAttributes( { useMailtoLink: checked } ) }
						/>
					</PanelBody>
				) }
			</InspectorControls>
			{ useMailtoLink && hasRealPreviewValue ? (
				<span { ...blockProps }>
					<a href={ `mailto:${ previewText }` } onClick={ ( event ) => event.preventDefault() }>
						{ previewText }
					</a>
				</span>
			) : (
				<span { ...blockProps }>{ previewText }</span>
			) }
		</>
	);
}
