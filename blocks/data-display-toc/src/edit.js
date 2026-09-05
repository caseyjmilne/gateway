import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { FormTokenField, Notice, PanelBody, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * Representative placeholder entries only -- same reasoning as
 * gateway/data-display-prev-next's own edit.js: there's no real
 * "headings that will actually end up in the active child's own
 * content" to reach for in the editor (that's a front-end-only,
 * scan-the-fully-rendered-DOM fact -- see render.php's own docblock).
 * Two levels deep, matching the kind of nesting `view.js`'s own
 * buildList() actually produces from a real H2/H3 mix.
 */
const PLACEHOLDER_ITEMS = [
	{ label: __( 'Overview', 'gateway' ), children: [] },
	{
		label: __( 'Getting Started', 'gateway' ),
		children: [ __( 'Installation', 'gateway' ), __( 'Configuration', 'gateway' ) ],
	},
	{ label: __( 'Next Steps', 'gateway' ), children: [] },
];

export default function Edit( { attributes, setAttributes, context } ) {
	const { heading, fieldKeys } = attributes;
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const blockProps = useBlockProps( { className: 'gateway-data-display-toc' } );

	// The SAME hook/REST route every other field picker in this plugin
	// already uses (gateway/card-field-text's own Field picker chief
	// among them) -- always exactly whichever fields the related
	// Collection actually has right now, never a stale/hardcoded guess.
	const { availableColumns, isLoading } = useAvailableColumns( '', {
		sourceType: 'collection',
		collection,
	} );

	// Only a field that could ever actually CONTAIN a heading is worth
	// offering here at all -- a plain Text/Number/Date/... field only
	// ever renders as escaped plain text or a bare value (never real
	// markup), so scanning it for `<h2>`-`<h6>` tags could never find
	// one; only a WYSIWYG field's own value is genuine, unescaped HTML
	// (`isHtmlRenderable` -- see `Field_Type::is_html_renderable()`'s
	// own docblock) that could realistically contain real heading tags
	// at all. Narrower than gateway/card-field-text's own Field picker
	// (which also offers every plain isTextRenderable field, since IT
	// can display any of them) -- this picker's own question is "could
	// headings live in here," not "can this block display it."
	const headingCapableColumns = availableColumns.filter(
		( column ) => column.isHtmlRenderable
	);

	// FormTokenField itself only ever deals in plain display strings
	// ("tokens"), never a separate key/value pair -- resolved through a
	// label<->key map instead, the same shape WordPress core's own
	// category/tag pickers already resolve an identically-shaped name
	// <-> id relationship through. A genuine label collision between two
	// different fields on the same model (Model_Fields enforces unique
	// NAMES, never unique LABELS) would resolve to whichever of them
	// happens to match first -- a real but extremely narrow edge case,
	// no different in kind from every other label-driven picker already
	// accepting the same trade-off.
	const labelByKey = new Map( headingCapableColumns.map( ( column ) => [ column.key, column.label ] ) );
	const keyByLabel = new Map( headingCapableColumns.map( ( column ) => [ column.label, column.key ] ) );

	const selectedLabels = fieldKeys
		.map( ( key ) => labelByKey.get( key ) )
		.filter( Boolean );

	const handleFieldKeysChange = ( labels ) => {
		// A freshly-TYPED value with no matching suggestion (FormTokenField
		// allows arbitrary free text by default) resolves to `undefined`
		// here and is dropped -- only a field that genuinely still exists
		// on this Collection is ever storable.
		const keys = labels.map( ( label ) => keyByLabel.get( label ) ).filter( Boolean );
		setAttributes( { fieldKeys: keys } );
	};

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Table of Contents Settings', 'gateway' ) }>
					<TextControl
						label={ __( 'Heading', 'gateway' ) }
						value={ heading }
						onChange={ ( value ) => setAttributes( { heading: value } ) }
					/>
					<FormTokenField
						__experimentalExpandOnFocus
						label={ __( 'Only Parse These Fields', 'gateway' ) }
						value={ selectedLabels }
						suggestions={ headingCapableColumns.map( ( column ) => column.label ) }
						disabled={ isLoading || ! collection || 0 === headingCapableColumns.length }
						onChange={ handleFieldKeysChange }
						help={ __(
							'Optional -- leave blank to scan every heading anywhere in the active item\'s own content. When set, only headings found within these fields\' own rendered value (a WYSIWYG field, typically) are listed.',
							'gateway'
						) }
					/>
					{ collection && ! isLoading && 0 === headingCapableColumns.length && (
						<Notice status="info" isDismissible={ false }>
							{ __(
								'This model has no WYSIWYG field -- the only kind of field that could ever contain a real heading. Leave this blank to keep scanning the whole item.',
								'gateway'
							) }
						</Notice>
					) }
				</PanelBody>
			</InspectorControls>
			<nav { ...blockProps } aria-label={ heading }>
				<p className="gateway-data-display-toc__heading">{ heading }</p>
				<div className="gateway-data-display-toc__list">
					<ul>
						{ PLACEHOLDER_ITEMS.map( ( item ) => (
							<li key={ item.label }>
								<a href="#">{ item.label }</a>
								{ item.children.length > 0 && (
									<ul>
										{ item.children.map( ( child ) => (
											<li key={ child }>
												<a href="#">{ child }</a>
											</li>
										) ) }
									</ul>
								) }
							</li>
						) ) }
					</ul>
				</div>
			</nav>
		</>
	);
}
