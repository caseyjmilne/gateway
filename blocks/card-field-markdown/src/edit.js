import { useMemo } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { marked } from 'marked';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * `gateway/card-field-text`'s own close sibling -- same Field picker
 * shape (`useAvailableColumns()`, the same hook/REST route every field
 * picker in this plugin already uses), narrowed to exactly ONE
 * eligibility signal instead of two: `isMarkdownRenderable`
 * (`Field_Type::is_markdown_renderable()`, true only for
 * `Markdown_Field_Type`) -- never `isTextRenderable`/`isHtmlRenderable`,
 * which is what already keeps a Markdown field OUT of
 * `gateway/card-field-text`'s own picker in the first place (see that
 * interface method's own docblock).
 *
 * The live preview here renders through `marked` -- a SEPARATE, JS-only
 * Markdown implementation from `Markdown_Converter`'s own
 * `league/commonmark` (the real, canonical conversion render.php
 * actually applies on the front end, see that class's own docblock) --
 * purely because there's no way to run real PHP from inside the block
 * editor's own JS runtime. Best-effort, not authoritative, the same
 * "live text shown here... falls back to the chosen field's label"
 * caveat `gateway/card-field-text`'s own docblock already gives for its
 * identically-best-effort preview: the two Markdown implementations
 * render the overwhelming majority of real-world Markdown identically,
 * but aren't guaranteed to agree on every edge case, and this preview
 * doesn't apply `Markdown_Converter`'s own safe HTML-escaping
 * configuration either (harmless here -- this is trusted,
 * manage_options-authored content rendering inside the block editor
 * itself, not a public-facing page).
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey } = attributes;
	const blockProps = useBlockProps( { className: 'gateway-card-field-markdown' } );

	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const record = context.record;
	const isCollection = 'collection' === sourceType;

	const {
		availableColumns,
		isLoading,
		error,
	} = useAvailableColumns( '', { sourceType: 'collection', collection } );

	// The SAME "keep a model's own fields and a related record's fields
	// visually separate" shape gateway/card-field-text's own picker
	// already uses, just filtered by isMarkdownRenderable instead of
	// isTextRenderable/isHtmlRenderable.
	const markdownColumns = availableColumns.filter( ( column ) => column.isMarkdownRenderable );
	const ownColumns = markdownColumns.filter( ( column ) => 'model_related_field' !== column.type );
	const relatedColumns = markdownColumns.filter( ( column ) => 'model_related_field' === column.type );

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

	const selectedColumn = markdownColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );

	let previewMarkdown = '';
	let previewLabel = __( '(no field selected)', 'gateway' );

	if ( fieldKey && isFieldConfigured ) {
		if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
			previewMarkdown = String( record[ fieldKey ] ?? '' );
		} else {
			previewLabel = selectedColumn.label;
		}
	}

	const previewHtml = useMemo(
		() => ( previewMarkdown ? marked.parse( previewMarkdown ) : '' ),
		[ previewMarkdown ]
	);

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
					{ isCollection && collection && ! isLoading && 0 === markdownColumns.length && (
						<Notice status="info" isDismissible={ false }>
							{ __( 'This model has no Markdown field yet.', 'gateway' ) }
						</Notice>
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
			{ previewHtml ? (
				<div { ...blockProps } dangerouslySetInnerHTML={ { __html: previewHtml } } />
			) : (
				<div { ...blockProps }>{ previewLabel }</div>
			) }
		</>
	);
}
