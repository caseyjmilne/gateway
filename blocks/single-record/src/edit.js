import { InspectorControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import CollectionControl from '../../shared/controls/collection-control';

/**
 * Editor UI for the gateway/single-record block -- deliberately plain
 * compared to gateway/data-cards-body/gateway/related-items' own edit.js
 * (both fetch a real preview record and feed it into a BlockContextProvider
 * so nested blocks show live data while editing): there's no equivalent
 * "one page 1 sample record" concept to preview here at all -- a single
 * -record template renders exactly ONE record, resolved from the URL a
 * visitor actually typed, which simply doesn't exist yet at edit time.
 * Building a live preview would mean either fetching an arbitrary record
 * from the chosen Collection (misleadingly implying THAT one is somehow
 * privileged) or leaving it perpetually empty -- neither earns its own
 * complexity here, so this only picks the Collection and otherwise gets
 * out of the way of the real InnerBlocks editing surface.
 *
 * Before a Collection is chosen, this shows a plain explanatory
 * placeholder and no editable InnerBlocks area at all -- same "nothing
 * meaningful to template yet" reasoning gateway/related-items' own
 * edit.js already applies before a relationship is picked (a
 * `useInnerBlocksProps()` div and an unrelated placeholder `<p>` can
 * never be siblings inside the SAME element: the props object's own
 * `children` -- the real InnerBlocks list/appender -- would just be
 * overridden by whatever JSX children follow it, silently breaking
 * InnerBlocks editing entirely). Once a Collection is chosen, this
 * switches to the bare `<div { ...innerBlocksProps } />`, exactly the
 * shape every other plain InnerBlocks wrapper in this plugin (e.g.
 * gateway/data-cards-header) already uses.
 *
 * `sourceType`/`collection` are provided as real block context
 * (`gateway/data-cards/sourceType`/`gateway/data-cards/collection` -- see
 * block.json's own `providesContext`, reusing the exact two keys
 * gateway/data-cards already provides), purely so gateway/card-field-text's
 * own Field picker (and gateway/related-items' own Relationship picker)
 * work inside this block's InnerBlocks exactly the way they already do
 * inside a Data Cards grid, rather than showing their own "Choose a
 * Collection on the Data Cards block first" notice, which would be
 * actively wrong advice here (there IS no Data Cards block on this kind
 * of page at all). `sourceType` itself is a fixed, hidden attribute
 * (always `'collection'`, no Inspector control of its own) -- this block
 * only ever has one possible source, unlike Data Cards' own postType/
 * Collection toggle.
 */
export default function Edit( { attributes: { collection }, setAttributes } ) {
	const blockProps = useBlockProps( { className: 'gateway-single-record' } );

	const inspectorControls = (
		<InspectorControls>
			<PanelBody title={ __( 'Single Record Settings', 'gateway' ) }>
				<CollectionControl
					value={ collection }
					onChange={ ( value ) => setAttributes( { collection: value } ) }
				/>
				<p className="description">
					{ __(
						'Root and Template Page are configured on this Collection’s own Permalinks tab, under Gateway › Models.',
						'gateway'
					) }
				</p>
			</PanelBody>
		</InspectorControls>
	);

	if ( ! collection ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-single-record__placeholder">
						{ __(
							'Choose a Collection in the Inspector, then design this template below with Gateway blocks (e.g. Card Field Text, Related Items) -- the real record a visitor requested fills them in on the front end.',
							'gateway'
						) }
					</p>
				</div>
			</>
		);
	}

	return <SingleRecordInnerBlocks blockProps={ blockProps } inspectorControls={ inspectorControls } />;
}

/**
 * Split out from Edit() purely so `useInnerBlocksProps()` -- a Hook -- is
 * never called conditionally: Edit() itself returns early, before ever
 * rendering this, whenever there's no Collection chosen yet.
 */
function SingleRecordInnerBlocks( { blockProps, inspectorControls } ) {
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		templateLock: false,
	} );

	return (
		<>
			{ inspectorControls }
			<div { ...innerBlocksProps } />
		</>
	);
}
