import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createBlock } from '@wordpress/blocks';

import SourceTypeControl from '../../shared/controls/source-type-control';
import PostTypeControl from '../../shared/controls/post-type-control';
import CollectionControl from '../../shared/controls/collection-control';
import LimitControl from '../../shared/controls/limit-control';
import PageSizeControl from '../../shared/controls/page-size-control';
import FacetsPanel from '../../shared/controls/facets-panel';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from '../../shared/hooks/use-reconcile-field-list';
import { useRequiredInnerBlocks } from '../../shared/hooks/use-required-inner-blocks';

// The entire front-end contract, in order: Facets above everything,
// Header (Page Size + Search) next, the grid itself, then Footer
// (Results + Pagination) -- mirrors gateway/datatable's own four zones
// exactly (see README.md for the "why" behind reusing the table's own
// top-level Facets panel/Default-value UI here, just without its
// "displayed column" gate). useRequiredInnerBlocks() keeps exactly these
// four present (inserting whichever are missing, without touching any
// that already exist) -- see that hook's own docblock for why, over a
// locked `template`/`templateLock: 'all'`.
const REQUIRED_BLOCKS = [
	'gateway/data-cards-facets',
	'gateway/data-cards-header',
	'gateway/data-cards-body',
	'gateway/data-cards-footer',
];

// The four fixed zones above, plus two more that are ALLOWED here but
// deliberately NOT in REQUIRED_BLOCKS (useRequiredInnerBlocks() would
// otherwise self-heal them right back the moment a site owner removed
// one, which is wrong for something genuinely optional):
// - gateway/card-facet itself: one of its three allowed homes is
//   directly here, as a sibling of the four zones (the other two are
//   inside gateway/data-cards-header/-footer -- see each one's own
//   edit.js) -- see that block's own "parent" restriction in its
//   block.json. Optional AND repeatable.
// - gateway/data-cards-empty: shown instead of an empty grid, per a
//   direct request ("give the user the ability to setup a block for
//   it") -- deliberately opt-in, not auto-inserted for every existing
//   (or brand new) Data Cards block: a site owner adds it from the
//   inserter only if they want this feature, so it's absent from the
//   `template` array below too.
const ALLOWED_BLOCKS = [ ...REQUIRED_BLOCKS, 'gateway/card-facet', 'gateway/data-cards-empty' ];

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
	const { sourceType, postType, collection, facets } = attributes;
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
		allowedBlocks: ALLOWED_BLOCKS,
		template: [
			[ 'gateway/data-cards-facets', {} ],
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

	// Fetched once per post type/Collection, purely to know which fields are
	// isFilterable -- gateway/data-cards has no "displayed columns" step
	// (no columns concept at all), so unlike gateway/datatable's own
	// Facets panel, this is the *only* narrowing this block's own picker
	// needs. A Collection's own fields are isFilterable too (see
	// Column_Registry::get_columns_for_collection()'s own docblock --
	// Facet_Query::apply_collection_facets() is the Eloquent counterpart
	// that actually applies one), except a Password field (never
	// filterable) or a TextArea field (free text only).
	const {
		availableColumns,
		isLoading: isLoadingColumns,
		error: columnsError,
	} = useAvailableColumns( postType, { sourceType, collection } );

	const selectableFacetColumns = availableColumns.filter(
		( column ) => column.isFilterable
	);

	// Drops a facet whose field is no longer filterable for the (possibly
	// new) post type -- same reconciliation gateway/datatable/edit.js
	// already runs against its own displayed columns, applied against
	// this block's own narrower "selectable" list instead.
	useReconcileFieldList( selectableFacetColumns, facets, ( value ) =>
		setAttributes( { facets: value } )
	);

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Cards Settings', 'gateway' ) }>
					<SourceTypeControl
						value={ sourceType }
						onChange={ ( value ) => setAttributes( { sourceType: value } ) }
					/>
					{ 'collection' === sourceType ? (
						<CollectionControl
							value={ collection }
							onChange={ ( value ) => setAttributes( { collection: value } ) }
						/>
					) : (
						<PostTypeControl
							value={ postType }
							onChange={ ( value ) => setAttributes( { postType: value } ) }
						/>
					) }
					<LimitControl
						value={ attributes.limit }
						onChange={ ( value ) => setAttributes( { limit: value } ) }
					/>
					<PageSizeControl
						value={ attributes.pageSize }
						onChange={ ( value ) => setAttributes( { pageSize: value } ) }
					/>
				</PanelBody>
				<PanelBody title={ __( 'Facets', 'gateway' ) } initialOpen={ false }>
					<FacetsPanel
						availableColumns={ availableColumns }
						selectableColumns={ selectableFacetColumns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						facets={ facets }
						onChange={ ( value ) => setAttributes( { facets: value } ) }
						emptyMessage={
							'collection' === sourceType
								? __(
										'No fields are available to use as facets for this Collection yet.',
										'gateway'
								  )
								: undefined
						}
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...innerBlocksProps } />
		</>
	);
}
