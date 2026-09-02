import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl, TextControl, ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';
import { useImageSizes } from '../../shared/use-image-sizes';

// A handful of common ratios -- the same small, curated set `core/image`
// itself offers, rather than a free-text input: a real CSS `aspect-ratio`
// value would work too, but picking from a known-good list is simpler
// and harder to get visibly wrong.
const ASPECT_RATIO_OPTIONS = [
	{ label: __( 'Original', 'gateway' ), value: '' },
	{ label: __( 'Square – 1:1', 'gateway' ), value: '1' },
	{ label: __( 'Standard – 4:3', 'gateway' ), value: '4/3' },
	{ label: __( 'Portrait – 3:4', 'gateway' ), value: '3/4' },
	{ label: __( 'Classic – 3:2', 'gateway' ), value: '3/2' },
	{ label: __( 'Classic Portrait – 2:3', 'gateway' ), value: '2/3' },
	{ label: __( 'Wide – 16:9', 'gateway' ), value: '16/9' },
	{ label: __( 'Tall – 9:16', 'gateway' ), value: '9/16' },
];

const SCALE_OPTIONS = [
	{ label: __( 'Fill (crop to fit)', 'gateway' ), value: 'cover' },
	{ label: __( 'Fit (show the whole image)', 'gateway' ), value: 'contain' },
];

const LINK_DESTINATION_OPTIONS = [
	{ label: __( 'None', 'gateway' ), value: 'none' },
	{ label: __( 'Media File', 'gateway' ), value: 'media' },
	{ label: __( 'Attachment Page', 'gateway' ), value: 'attachment' },
	{ label: __( 'Custom URL', 'gateway' ), value: 'custom' },
];

/**
 * Structurally the same as gateway/card-field-text/gateway/card-field-number's
 * own edit.js -- same `useAvailableColumns()` fetch, same context-reading
 * caveats (see gateway/card-field-text's own docblock for the full
 * "synthetic wrapper block" reasoning this shares verbatim). The real
 * differences: the Field picker is filtered to `isImage` instead of
 * `isTextRenderable`/`isNumeric` (Column_Registry's own reuse of
 * `Field_Type::supports_media_settings()`, true only for Image_Field_Type
 * -- see that method's own docblock), and a second attribute, `size`, is
 * ONLY offered when the selected field's own `returnFormat` actually
 * supports resolving one -- 'array'/'id' can (both are backed by the
 * same real attachment id, so either can look up any registered size);
 * 'url' is a flat string with no id to look a different size up from at
 * all, so that field always renders full-size on the front end
 * regardless of anything chosen here, and the Size control simply isn't
 * shown for it -- see this block's own render.php / Image_Renderer's
 * own docblock for the authoritative version of this same reasoning.
 *
 * The live preview is more limited than gateway/card-field-text's own
 * (which can always just print `record[fieldKey]` as-is once it has a
 * real preview record): a 'url'-format field's own preview value is
 * already a plain URL string, directly usable as an `<img src>`, and an
 * 'array'-format one is an already-enriched `{sizes: {...}, url, ...}`
 * object this can pull the chosen size's own URL from -- but an
 * 'id'-format field's own preview value is a bare integer with no URL in
 * it at all (the whole point of that Return Format), and resolving one
 * would need a further REST round trip this block doesn't make. That one
 * case falls back to a plain text placeholder instead, the same
 * "preview is best-effort, the real front end is authoritative" caveat
 * gateway/card-field-text's own docblock already states explicitly.
 *
 * Also offers Aspect Ratio/Object Fit and Link Settings, rounding this
 * block out toward `core/image`'s own settings per a direct request --
 * see render.php's own docblock for the full reasoning (both work
 * uniformly across all three Return Formats, unlike Size). Align/
 * Anchor/Spacing(Margin)/Border/Duotone need no code here at all --
 * plain `block.json` `supports` declarations the block editor already
 * wires up its own Inspector controls for automatically.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey, size, aspectRatio, scale, linkDestination, linkTarget, href } = attributes;
	// `display: inline-block` + `overflow: hidden` here for the exact
	// same reason render.php's own docblock gives for the identical
	// style it adds server-side -- see that file's own comment.
	const blockProps = useBlockProps( {
		className: 'gateway-card-field-image',
		style: { display: 'inline-block', overflow: 'hidden' },
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

	const { imageSizes, isLoading: isLoadingSizes } = useImageSizes();

	// Only a field whose own type declares itself isImage -- see
	// gateway/card-field-text/gateway/card-field-number's own identical
	// reasoning, just against this flag instead.
	const imageColumns = availableColumns.filter(
		( column ) => true === column.isImage
	);

	const options = [
		{ label: __( '— Select a field —', 'gateway' ), value: '' },
		...imageColumns.map( ( column ) => ( {
			label: column.label,
			value: column.key,
		} ) ),
	];

	const selectedColumn = imageColumns.find( ( column ) => column.key === fieldKey );
	const isFieldConfigured = Boolean( selectedColumn );
	const returnFormat = selectedColumn ? selectedColumn.returnFormat : 'array';
	// Both 'array' and 'id' are backed by the exact same real attachment
	// id under the hood, so either can resolve ANY registered size --
	// only 'url' (a flat string, no id) can't. See this component's own
	// docblock, and Image_Renderer's, for the full reasoning.
	const supportsSize = 'url' !== returnFormat;

	let preview = null;

	if ( ! fieldKey || ! isFieldConfigured ) {
		preview = (
			<span className="gateway-card-field-image__placeholder">
				{ __( '(no field selected)', 'gateway' ) }
			</span>
		);
	} else if ( record && Object.prototype.hasOwnProperty.call( record, fieldKey ) ) {
		const value = record[ fieldKey ];

		let previewUrl = '';

		if ( 'string' === typeof value && value ) {
			// 'url' format -- already a plain, directly usable URL.
			previewUrl = value;
		} else if ( value && 'object' === typeof value ) {
			// 'array' format -- prefer the chosen size's own URL, falling
			// back to the full-size one if that size isn't registered
			// (or has no metadata yet) for this particular attachment.
			previewUrl = ( value.sizes && value.sizes[ size ] && value.sizes[ size ].url ) || value.url || '';
		}

		preview = previewUrl ? (
			<img
				className="gateway-card-field-image__preview"
				src={ previewUrl }
				alt=""
			/>
		) : (
			// 'id' format (a bare integer, nothing to build a URL from
			// without a further REST round trip this block doesn't make),
			// or a field that's simply never had an image picked yet.
			<span className="gateway-card-field-image__placeholder">
				{ selectedColumn.label }
			</span>
		);
	} else {
		preview = (
			<span className="gateway-card-field-image__placeholder">
				{ selectedColumn.label }
			</span>
		);
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
					{ isCollection && collection && ! isLoading && imageColumns.length === 0 && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This Collection has no Image fields yet -- add one on its own Fields tab first.',
								'gateway'
							) }
						</Notice>
					) }
					{ isCollection && collection && fieldKey && ! isFieldConfigured && ! isLoading && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This field no longer exists (or is no longer an Image field) on the selected Collection. Choose another.',
								'gateway'
							) }
						</Notice>
					) }
				</PanelBody>
				{ isFieldConfigured && (
					<PanelBody title={ __( 'Size', 'gateway' ) }>
						{ supportsSize ? (
							<SelectControl
								__nextHasNoMarginBottom
								label={ __( 'Image Size', 'gateway' ) }
								value={ size }
								options={
									imageSizes.length > 0
										? imageSizes.map( ( option ) => ( {
												label: option.label,
												value: option.key,
										  } ) )
										: [ { label: __( 'Full Size', 'gateway' ), value: 'full' } ]
								}
								disabled={ isLoadingSizes }
								onChange={ ( value ) => setAttributes( { size: value } ) }
							/>
						) : (
							<Notice status="info" isDismissible={ false }>
								{ __(
									'This field’s own Return Format is set to “URL” -- it always renders at full size. Choose “Image Array” or “Image ID” on the field’s own General tab to pick a size here instead.',
									'gateway'
								) }
							</Notice>
						) }
					</PanelBody>
				) }
				{ isFieldConfigured && (
					<PanelBody title={ __( 'Aspect Ratio', 'gateway' ) } initialOpen={ false }>
						<SelectControl
							__nextHasNoMarginBottom
							label={ __( 'Aspect Ratio', 'gateway' ) }
							value={ aspectRatio }
							options={ ASPECT_RATIO_OPTIONS }
							onChange={ ( value ) => setAttributes( { aspectRatio: value } ) }
						/>
						{ aspectRatio && (
							<SelectControl
								__nextHasNoMarginBottom
								label={ __( 'Object Fit', 'gateway' ) }
								value={ scale }
								options={ SCALE_OPTIONS }
								onChange={ ( value ) => setAttributes( { scale: value } ) }
							/>
						) }
					</PanelBody>
				) }
				{ isFieldConfigured && (
					<PanelBody title={ __( 'Link Settings', 'gateway' ) } initialOpen={ false }>
						<SelectControl
							__nextHasNoMarginBottom
							label={ __( 'Link To', 'gateway' ) }
							value={ linkDestination }
							options={ LINK_DESTINATION_OPTIONS }
							onChange={ ( value ) => setAttributes( { linkDestination: value } ) }
						/>
						{ 'custom' === linkDestination && (
							<TextControl
								__nextHasNoMarginBottom
								label={ __( 'URL', 'gateway' ) }
								value={ href }
								onChange={ ( value ) => setAttributes( { href: value } ) }
							/>
						) }
						{ 'none' !== linkDestination && (
							<ToggleControl
								__nextHasNoMarginBottom
								label={ __( 'Open in new tab', 'gateway' ) }
								checked={ '_blank' === linkTarget }
								onChange={ ( checked ) =>
									setAttributes( { linkTarget: checked ? '_blank' : '' } )
								}
							/>
						) }
					</PanelBody>
				) }
			</InspectorControls>
			<span { ...blockProps }>{ preview }</span>
		</>
	);
}
