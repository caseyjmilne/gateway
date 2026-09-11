import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createBlock } from '@wordpress/blocks';

import SourceTypeControl from '../../shared/controls/source-type-control';
import PostTypeControl from '../../shared/controls/post-type-control';
import CollectionControl from '../../shared/controls/collection-control';
import LimitControl from '../../shared/controls/limit-control';
import PageSizeControl from '../../shared/controls/page-size-control';
import OrderControl from '../../shared/controls/order-control';
import FacetsPanel from '../../shared/controls/facets-panel';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from '../../shared/hooks/use-reconcile-field-list';
import { useRequiredInnerBlocks } from '../../shared/hooks/use-required-inner-blocks';

// The entire front-end contract, in order: Header (Page Size + Search),
// the grid itself, Empty (shown only when the grid currently has nothing
// to display -- see gateway/data-cards-empty's own render.php), then
// Footer (Results + Pagination) -- see README.md for the "why" behind
// this Facets panel/Default-value UI's own design. useRequiredInnerBlocks()
// keeps exactly these four
// present (inserting whichever are missing, without touching any that
// already exist) -- see that hook's own docblock for why, over a locked
// `template`/`templateLock: 'all'`. gateway/data-cards-empty was
// originally left OUT of this list (opt-in only, never seeded into the
// `template` below) -- reversed per direct, explicit follow-up
// feedback: "Data Cards Empty should be in the template and auto added
// when we drop in Data Cards." A site owner who genuinely doesn't want
// the feature can still empty out its OWN InnerBlocks content (render.php
// renders nothing at all once `$content` is blank -- see that file's own
// docblock); only the wrapper zone itself, like Header/Footer/Body
// before it, is never removable outright.
//
// There used to be a FIFTH required zone here, gateway/data-cards-facets
// -- a bespoke container block whose only real job was "an editable
// InnerBlocks area, holding gateway/card-facet controls." Removed
// entirely: a plain `core/group` (transformable to Row/Stack/whatever a
// site owner wants) already does exactly that, and this plugin was
// building its own narrow container blocks in places a real core block
// already covers -- see "Preferring core blocks over bespoke containers"
// in README.md for the fuller reasoning. Its own front-end role (a
// left-aligned row of facet controls above the grid) is now just a
// `template`-seeded `core/group` -- see below -- not a required, self
// -healing zone: it's ordinary, freely replaceable content from here on,
// exactly like any other block a site owner might add.
//
// gateway/data-cards-header itself was removed the same way, later --
// its only real job was identical to gateway/data-cards-facets' own:
// "an editable InnerBlocks area, holding Page Size + Search," just with
// a `space-between` flex layout instead of a left-aligned one. Per a
// direct request ("convert Data Cards Header from custom block to Row...
// when done remove the custom block entirely"), it's now a
// `template`-seeded `core/group` Row too (see below), renamed to display
// as "Cards Header" the same `metadata.name` way the Facets Row already
// displays as "Cards Facets."
//
// gateway/data-cards-footer was removed the exact same way, later still
// -- its only real job was "an editable InnerBlocks area, holding
// Pagination + Results," with a `space-between` flex layout. Per a
// direct request ("convert Data Cards Footer to Row... remove the
// custom block"), it's now a `template`-seeded `core/group` Row too (see
// below), carrying `style.spacing` to preserve the old block's own
// `gap`/`margin-top` CSS, renamed to display as "Cards Footer."
const REQUIRED_BLOCKS = [
	'gateway/data-cards-body',
	'gateway/data-cards-empty',
];

// gateway/card-facet stays optional and repeatable, unlike the four
// zones above, so it's never added to REQUIRED_BLOCKS -- useRequiredInnerBlocks()
// would otherwise self-heal a removed one right back. It's also no
// longer restricted to a fixed set of allowed DIRECT parents at all --
// its own block.json now declares `"ancestor": ["gateway/data-cards"]`
// instead of a `"parent"` list, so it can live anywhere inside a Data
// Cards block's own InnerBlocks tree, at any depth, inside whatever
// layout a site owner chooses (the `core/group` row seeded below, a
// Stack, Columns, directly loose here, wherever) -- "ancestor of Data
// Cards" is now the ONLY placement restriction it has, per a direct
// request.
//
// No `allowedBlocks` is passed to useInnerBlocksProps() below at all --
// an earlier version restricted this block's own InnerBlocks to exactly
// REQUIRED_BLOCKS + gateway/card-facet, which also meant a site owner
// could never add a plain layout block (a Row/Group, a Heading, ...)
// directly here. Reported directly: "Data Cards should allow more items
// to be added in case user wants to add rows or other core blocks."
// Every one of the four zones (plus gateway/card-facet) still only
// belongs here at all via ITS OWN block.json's own restriction --
// removing this list doesn't weaken that, it only stops blocking
// everything else.

/**
 * @param {string} name One of REQUIRED_BLOCKS.
 * @return {Object} A freshly created block instance for that name, with its own default children where it needs them.
 */
function buildRequiredBlock( name ) {
	if ( 'gateway/data-cards-empty' === name ) {
		// A real, immediately-useful default rather than a blank box a
		// site owner has to know to fill in themselves -- freely
		// editable/replaceable afterward, the same "starting point, not a
		// restriction" spirit gateway/data-cards-body's own default card
		// template (Featured Image + Title + Excerpt) already follows.
		return createBlock( name, {}, [
			createBlock( 'core/paragraph', {
				content: __( 'No results found.', 'gateway' ),
			} ),
		] );
	}

	return createBlock( name );
}

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { sourceType, postType, collection, facets, orderBy, order } = attributes;
	// `className: 'gateway-data-cards-block'` -- matching render.php's own
	// `get_block_wrapper_attributes()` call -- so this element is findable
	// by that class in the editor too, not just the front end: shared/
	// cards.js's findCardsGridElement() locates its sibling grid via
	// `.closest('.gateway-data-cards-block')`.
	const blockProps = useBlockProps( { className: 'gateway-data-cards-block' } );

	useRequiredInnerBlocks( clientId, REQUIRED_BLOCKS, buildRequiredBlock );

	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		// No `allowedBlocks` here at all, deliberately -- see the
		// gateway/card-facet comment above for why.
		template: [
			// A plain core/group, seeded as its own "Row" variation
			// (`layout: { type: 'flex', flexWrap: 'nowrap', justifyContent:
			// 'left' }` -- the exact attributes core's own Row transform
			// produces, confirmed against `packages/block-library/src/
			// group/variations.js` in a `wordpress/gutenberg` checkout),
			// renamed to display as "Cards Facets" (see its own `metadata.name`
			// comment below), left empty for a site owner to drop
			// gateway/card-facet controls into -- the direct replacement
			// for the old, bespoke gateway/data-cards-facets container
			// block. Ordinary, freely replaceable/transformable content
			// from here on (`templateLock: false` below, same as
			// everything else in this template) -- a site owner can turn
			// it into a Stack, a Columns block, or delete it outright, per
			// a direct request: "user should be able to replace that
			// block... they may choose a stack."
			[
				'core/group',
				{
					layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'left' },
					// Shows as "Cards Facets" in the block editor's List View
					// instead of the generic "Row" -- WordPress's Block Renaming
					// feature (WP 6.5+, `metadata.name`, gated by
					// `supports.renaming` which core/group doesn't opt out of;
					// degrades gracefully -- simply ignored -- on older WordPress
					// versions). Otherwise a site owner has no indication why an
					// empty Row sits here, per a direct report. "Cards " prefix
					// (not plain "Facets") for naming congruency with this
					// template's other Rows ("Cards Header," "Cards Footer").
					metadata: { name: __( 'Cards Facets', 'gateway' ) },
				},
				[],
			],
			// The Header, formerly its own bespoke gateway/data-cards-header
			// container block -- removed entirely (see the REQUIRED_BLOCKS
			// comment above), replaced by a plain `core/group` seeded with
			// the exact same `space-between` flex layout that block's own
			// hand-written CSS used, so an already-published site's Header
			// looks identical the moment it's rebuilt from this template.
			// Renamed to display as "Cards Header" (not the generic "Row")
			// the same `metadata.name` way the Facets Row above displays as
			// "Cards Facets" -- otherwise a site owner has no indication what
			// this one's for either. Ordinary, freely replaceable/
			// transformable content from here on (`templateLock: false`
			// below), exactly like the Facets Row.
			[
				'core/group',
				{
					layout: { type: 'flex', flexWrap: 'wrap', justifyContent: 'space-between' },
					metadata: { name: __( 'Cards Header', 'gateway' ) },
				},
				[
					[ 'gateway/data-cards-page-size', {} ],
					[ 'gateway/card-facet-search', {} ],
				],
			],
			[ 'gateway/data-cards-body', {} ],
			[
				'gateway/data-cards-empty',
				{},
				[ [ 'core/paragraph', { content: __( 'No results found.', 'gateway' ) } ] ],
			],
			// The Footer, formerly its own bespoke gateway/data-cards-footer
			// container block -- removed entirely (see the REQUIRED_BLOCKS
			// comment above), replaced by a plain `core/group` carrying the
			// exact same `space-between` flex layout AND `blockGap`/
			// `margin-top` spacing that block's own hand-written CSS used
			// (`core/group` already supports both natively), so an already
			// -published site's Footer looks identical the moment it's
			// rebuilt from this template. Renamed to display as "Cards
			// Footer" the same `metadata.name` way the Header/Facets Rows
			// already display as "Cards Header"/"Cards Facets." Ordinary,
			// freely replaceable/transformable content from here on
			// (`templateLock: false` below), exactly like the other Rows.
			[
				'core/group',
				{
					layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'space-between' },
					style: { spacing: { blockGap: '1em', margin: { top: '1em' } } },
					metadata: { name: __( 'Cards Footer', 'gateway' ) },
				},
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
	// (no columns concept at all), so this is the *only* narrowing this
	// block's own picker needs. A Collection's own fields are isFilterable too (see
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

	// gateway/data-cards' own Order By picker -- Column_Registry's own
	// `isOrderable` flag, computed for a Collection's fields via
	// `Field_Type::is_orderable()`, and, for a post
	// type, via the narrower ORDERABLE_CORE_COLUMNS allowlist (see that
	// const's own docblock for why it's smaller than isFilterable's own
	// list). 'id'/'post_date' below are this source type's own REAL
	// current default field's own key (not just its label) -- order
	// -control.js's own `value` substitutes it in whenever `orderBy` is
	// still `''`, so the picker always shows one real, correct selection
	// rather than a separate "Default" entry duplicating it.
	const orderByOptions = availableColumns
		.filter( ( column ) => column.isOrderable )
		.map( ( column ) => ( { label: column.label, value: column.key } ) );
	const defaultOrderByValue = 'collection' === sourceType ? 'id' : 'post_date';
	const defaultOrder = 'desc';

	// Drops a facet whose field is no longer filterable for the (possibly
	// new) post type, against this block's own "selectable" list.
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
					{ /* Hidden until there's at least one real orderable field to
					   show pre-selected (still loading, or -- for a
					   Collection source -- no model chosen yet): showing the
					   picker with nothing matching its own `value` would just
					   read as a blank, broken select. */ }
					{ orderByOptions.length > 0 && (
						<OrderControl
							orderBy={ orderBy }
							order={ order }
							orderByOptions={ orderByOptions }
							defaultOrderByValue={ defaultOrderByValue }
							defaultOrder={ defaultOrder }
							onOrderByChange={ ( value ) => setAttributes( { orderBy: value } ) }
							onOrderChange={ ( value ) => setAttributes( { order: value } ) }
						/>
					) }
				</PanelBody>
				{ /* "Filters" here, not "Facets" -- this is where a site owner
				   picks fields and sets their own default/always-applied
				   value for the query itself, distinct from the gateway/
				   card-facet(-has-value) BLOCKS a visitor actually interacts
				   with on the front end; the shared terminology read as
				   confusing between the two, per a direct request. */ }
				<PanelBody title={ __( 'Filters', 'gateway' ) } initialOpen={ false }>
					<FacetsPanel
						availableColumns={ availableColumns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						facets={ facets }
						onChange={ ( value ) => setAttributes( { facets: value } ) }
						emptyMessage={
							'collection' === sourceType
								? __(
										'No fields are available to use as filters for this Model yet.',
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
