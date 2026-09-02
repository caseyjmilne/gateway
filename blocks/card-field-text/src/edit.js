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
 *
 * Also offers/previews a WYSIWYG field's own value (`isHtmlRenderable`,
 * `Field_Type::is_html_renderable()`) alongside every plain-text one --
 * per a direct request ("the text field should be able to display
 * WYSIWYG fields... be sure we render any HTML"), rather than a second,
 * near-identical block existing solely to flip one rendering detail.
 * `dangerouslySetInnerHTML` renders that one's own preview as real
 * markup here too (a `<p>`/`<br>` genuinely breaks the line, matching
 * what render.php actually prints on the front end) rather than escaped
 * plain text -- safe for the same reason render.php's own docblock
 * gives: this value only ever reaches here from the record's own
 * already-fetched REST response, itself gated behind the same
 * manage_options-only write path a WordPress admin's own post content
 * already gets the identical trust for.
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

	// A field whose own type declares itself EITHER isTextRenderable OR
	// isHtmlRenderable (Column_Registry::get_columns_for_collection(),
	// driven by each Field_Type's own is_text_renderable()/
	// is_html_renderable()) is offered here -- a Password field's secret
	// value has no business being printed as public text, and a Relate
	// to One/Relate to Many field's own raw value is either a
	// meaningless bare id or, for Relate to Many, not even a real column
	// (reading it as a plain attribute would return the relationship
	// itself, which render.php can't cast to a string at all). Neither
	// ever belongs in this block's own picker -- a related record's own
	// label needs the dedicated relate-field handling
	// gateway/related-items/gateway/data-display already do, not this
	// generic "print the raw attribute" block. A WYSIWYG field (only
	// isHtmlRenderable, never isTextRenderable -- see that flag's own
	// docblock) IS offered here now, per a direct request to display it
	// through this same block rather than a second one of its own.
	const renderableColumns = availableColumns.filter(
		( column ) => false !== column.isTextRenderable || true === column.isHtmlRenderable
	);

	// A hasOne/belongsTo relationship's own fields (Column_Registry::
	// get_related_columns_for_collection(), type 'model_related_field')
	// are kept together at the end of this flat list, under their own
	// disabled "Related Fields" heading option -- SelectControl has no
	// real optgroup support, but a disabled option renders as an inert,
	// visually distinct divider in every browser, which is enough to
	// keep "this model's own fields" and "a related record's fields"
	// from reading as one undifferentiated list.
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
						// Not '' -- that's already the placeholder option's
						// own value above, and a duplicate would collide as
						// a React list key. This is disabled and therefore
						// never actually selectable, so the value itself
						// only needs to be distinct, not meaningful.
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
	// isTextRenderable (or one whose type changed into a non-renderable
	// one since) must show the same "no longer exists" style warning
	// below as a genuinely removed field, not silently keep rendering a
	// value this block was never meant to show.
	const selectedColumn = renderableColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );

	let previewText = __( '(no field selected)', 'gateway' );
	// Only ever true alongside a real record value below, never for the
	// "(no field selected)"/label fallbacks -- those are always this
	// plugin's own plain, trusted UI copy, nothing that ever needs
	// rendering as markup.
	let previewIsHtml = false;

	if ( fieldKey && isFieldConfigured ) {
		if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
			previewText = String( record[ fieldKey ] ?? '' );
			previewIsHtml = true === selectedColumn.isHtmlRenderable;
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
			{ previewIsHtml ? (
				<span { ...blockProps } dangerouslySetInnerHTML={ { __html: previewText } } />
			) : (
				<span { ...blockProps }>{ previewText }</span>
			) }
		</>
	);
}
