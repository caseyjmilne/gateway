import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, Notice, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';
import { useImageSizes } from '../../shared/use-image-sizes';

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
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const { fieldKey, size } = attributes;
	const blockProps = useBlockProps( { className: 'gateway-card-field-image' } );

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
			</InspectorControls>
			<span { ...blockProps }>{ preview }</span>
		</>
	);
}
