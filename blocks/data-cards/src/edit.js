import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createBlock } from '@wordpress/blocks';

import PostTypeControl from '../../shared/controls/post-type-control';
import LimitControl from '../../shared/controls/limit-control';
import PageSizeControl from '../../shared/controls/page-size-control';
import { useRequiredInnerBlocks } from '../../shared/hooks/use-required-inner-blocks';

// The entire front-end contract, in order: Header (Page Size + Search)
// above the grid, the grid itself, then Footer (Results + Pagination) --
// mirrors gateway/datatable's own three-of-its-four zones (no Facets
// equivalent in this family -- see README.md for why). useRequiredInnerBlocks()
// keeps exactly these three present (inserting whichever are missing,
// without touching any that already exist) rather than a locked
// `template`/`templateLock: 'all'` -- see that hook's own docblock for why.
const REQUIRED_BLOCKS = [
	'gateway/data-cards-header',
	'gateway/data-cards-body',
	'gateway/data-cards-footer',
];

/**
 * @param {string} name One of REQUIRED_BLOCKS.
 * @return {Object} A freshly created block instance for that name, with its own default children where it needs them.
 */
function buildRequiredBlock( name ) {
	if ( 'gateway/data-cards-header' === name ) {
		return createBlock( name, {}, [
			createBlock( 'gateway/data-cards-page-size' ),
			createBlock( 'gateway/data-cards-search' ),
		] );
	}

	if ( 'gateway/data-cards-footer' === name ) {
		return createBlock( name, {}, [
			createBlock( 'gateway/data-cards-pagination' ),
			createBlock( 'gateway/data-cards-results' ),
		] );
	}

	return createBlock( name );
}

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { postType } = attributes;
	// `className: 'gateway-data-cards-block'` -- matching render.php's own
	// `get_block_wrapper_attributes()` call -- so this element is findable
	// by that class in the editor too, not just the front end: shared/
	// cards.js's findCardsGridElement() locates its sibling grid via
	// `.closest('.gateway-data-cards-block')`, the same convention
	// gateway/datatable's own blockProps className comment already
	// establishes for the table family.
	const blockProps = useBlockProps( { className: 'gateway-data-cards-block' } );

	useRequiredInnerBlocks( clientId, REQUIRED_BLOCKS, buildRequiredBlock );

	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: REQUIRED_BLOCKS,
		template: [
			[
				'gateway/data-cards-header',
				{},
				[
					[ 'gateway/data-cards-page-size', {} ],
					[ 'gateway/data-cards-search', {} ],
				],
			],
			[ 'gateway/data-cards-body', {} ],
			[
				'gateway/data-cards-footer',
				{},
				[
					[ 'gateway/data-cards-pagination', {} ],
					[ 'gateway/data-cards-results', {} ],
				],
			],
		],
		templateLock: false,
	} );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Cards Settings', 'gateway' ) }>
					<PostTypeControl
						value={ postType }
						onChange={ ( value ) => setAttributes( { postType: value } ) }
					/>
					<LimitControl
						value={ attributes.limit }
						onChange={ ( value ) => setAttributes( { limit: value } ) }
					/>
					<PageSizeControl
						value={ attributes.pageSize }
						onChange={ ( value ) => setAttributes( { pageSize: value } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...innerBlocksProps } />
		</>
	);
}
