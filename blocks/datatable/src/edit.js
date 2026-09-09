import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createBlock } from '@wordpress/blocks';

import SourceTypeControl from '../../shared/controls/source-type-control';
import PostTypeControl from '../../shared/controls/post-type-control';
import CollectionControl from '../../shared/controls/collection-control';
import LimitControl from '../../shared/controls/limit-control';
import PageSizeControl from '../../shared/controls/page-size-control';
import ColumnsPanel from './controls/columns-panel';
import FacetsPanel from '../../shared/controls/facets-panel';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from '../../shared/hooks/use-reconcile-field-list';
import { useRequiredInnerBlocks } from '../../shared/hooks/use-required-inner-blocks';

const DEFAULT_COLUMNS = [
	{ key: 'ID', sortable: true },
	{ key: 'post_title', sortable: true },
];

// The entire front-end contract, in order: Facets above everything, Header
// (Page Size + Search) next, then the table itself, then Footer (Results +
// Pagination) -- see render.php's own comment for how this maps to
// DataTables' own default layout. useRequiredInnerBlocks() keeps exactly
// these three present (inserting whichever are missing, without touching
// any that already exist) rather than a locked `template`/`templateLock:
// 'all'` -- see that hook's own docblock for why: an existing block saved
// before a later-added required child (like gateway/datatable-body) would
// otherwise have that new child's position matched, by the built-in
// template sync, against whatever *existing* block already happened to
// sit there -- silently discarding it -- rather than actually inserting
// the new one.
//
// There used to be a FOURTH required zone here, gateway/datatable-facets
// -- a bespoke container block whose only real job was "an editable
// InnerBlocks area, holding gateway/facet(-has-value/-text) controls."
// Removed entirely, per a direct request ("Replace Data Table Facets
// block with a core Row block... we won't use it again"): a plain
// `core/group` (transformable to Row/Stack/whatever a site owner wants)
// already does exactly that -- the same "Preferring core blocks over
// bespoke containers" precedent gateway/data-cards-facets' own removal
// already set (see README.md). Its own front-end role (a left-aligned
// row of facet controls above the table) is now just a `template`-seeded
// `core/group` -- see below -- not a required, self-healing zone: it's
// ordinary, freely replaceable content from here on, exactly like every
// other block a site owner might add.
const REQUIRED_BLOCKS = [
	'gateway/datatable-header',
	'gateway/datatable-body',
	'gateway/datatable-footer',
];

// Unlike gateway/data-cards' own equivalent InnerBlocks area (fully
// opened up to any block at all, per a separate, later direct request),
// gateway/datatable's own top-level InnerBlocks stays a closed set --
// exactly REQUIRED_BLOCKS above, plus the one, freely-replaceable
// `core/group` seeded in `template` below. `core/group` is deliberately
// listed here but NOT in REQUIRED_BLOCKS: allowed (so a site owner can
// still add one back after deleting it, or the template-seeded one can
// exist at all), but never self-healed back in the moment it's removed --
// the same distinction gateway/data-cards' own template-seeded Row
// draws.
const ALLOWED_BLOCKS = [ 'core/group', ...REQUIRED_BLOCKS ];

/**
 * @param {string} name One of REQUIRED_BLOCKS.
 * @return {Object} A freshly created block instance for that name, with its own default children where it needs them.
 */
function buildRequiredBlock( name ) {
	if ( 'gateway/datatable-header' === name ) {
		return createBlock( name, {}, [
			createBlock( 'gateway/datatable-page-size' ),
			createBlock( 'gateway/datatable-search' ),
		] );
	}

	if ( 'gateway/datatable-footer' === name ) {
		return createBlock( name, {}, [
			createBlock( 'gateway/pagination' ),
			createBlock( 'gateway/datatable-results' ),
		] );
	}

	return createBlock( name );
}

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { sourceType, postType, collection, columns, facets } = attributes;
	// `className: 'gateway-datatable-block'` -- matching render.php's own
	// `get_block_wrapper_attributes()` call -- so this element is findable
	// by that class in the editor too, not just the front end: several
	// descendant blocks (gateway/facet, gateway/pagination, ...) locate
	// their sibling table via `.closest( '.gateway-datatable-block' )`
	// (shared/wait-for-datatable.js's findDataTableElement()), including,
	// as of gateway/pagination's own live editor preview, from *inside*
	// the editor canvas -- something no earlier block actually needed
	// here, since every other one's own editor preview was static and
	// never tried to find the table at all.
	const blockProps = useBlockProps( { className: 'gateway-datatable-block' } );

	useRequiredInnerBlocks( clientId, REQUIRED_BLOCKS, buildRequiredBlock );

	// Because Body is a genuine sibling block here, rendered in its own
	// right (see its own edit.js), the editor's visual order matches the
	// front end exactly -- Facets, Header, then the table, then Footer --
	// rather than the table appearing separately, below this list, via a
	// <ServerSideRender> of the whole parent.
	//
	// `template` here is safe in a way it wasn't when it was paired with
	// `templateLock: 'all'` (see useRequiredInnerBlocks' own docblock for
	// that history): Gutenberg only ever applies a `template` automatically
	// when the InnerBlocks area is *completely empty* -- true regardless of
	// `templateLock`'s own value -- so it can only ever fill a genuinely
	// brand-new datatable block, never reshuffle or discard anything from
	// one that already has content. That's exactly the "drop a fresh block
	// in and everything appears at once" case; useRequiredInnerBlocks()
	// remains the mechanism for the *other* case this can't cover on its
	// own -- an existing block already past that empty-list moment, missing
	// only a since-added required child.
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: ALLOWED_BLOCKS,
		template: [
			// A plain core/group, seeded as its own "Row" variation
			// (`layout: { type: 'flex', flexWrap: 'nowrap', justifyContent:
			// 'left' }` -- the exact attributes core's own Row transform
			// produces, confirmed against `packages/block-library/src/
			// group/variations.js` in a `wordpress/gutenberg` checkout,
			// and the same attributes gateway/data-cards' own equivalent
			// Row already uses) left empty for a site owner to drop
			// gateway/facet(-has-value/-text) controls into -- the direct
			// replacement for the old, bespoke gateway/datatable-facets
			// container block. Ordinary, freely replaceable/transformable
			// content from here on (`templateLock: false` below, same as
			// everything else in this template) -- a site owner can turn
			// it into a Stack, a Columns block, or delete it outright.
			[ 'core/group', { layout: { type: 'flex', flexWrap: 'nowrap', justifyContent: 'left' } }, [] ],
			[
				'gateway/datatable-header',
				{},
				[
					[ 'gateway/datatable-page-size', {} ],
					[ 'gateway/datatable-search', {} ],
				],
			],
			[ 'gateway/datatable-body', {} ],
			[
				'gateway/datatable-footer',
				{},
				[ [ 'gateway/pagination', {} ], [ 'gateway/datatable-results', {} ] ],
			],
		],
		templateLock: false,
	} );

	// Fetched once per post type/model and shared by both panels below:
	// "what fields are available" is the same question for columns (what
	// to display) and facets (what to filter by) -- regardless of which
	// Source is selected, see useAvailableColumns()'s own docblock.
	const {
		availableColumns,
		isLoading: isLoadingColumns,
		error: columnsError,
	} = useAvailableColumns( postType, { sourceType, collection } );

	// A Collection's field names aren't known ahead of time the way
	// "ID"/"post_title" always are for a post type, so its own default
	// selection (its `id` column plus its first real field, if it has
	// one) is computed from whatever's actually available -- still
	// filtered against availableKeys the same way DEFAULT_COLUMNS is,
	// inside useReconcileFieldList() itself.
	const defaultColumns =
		'collection' === sourceType
			? availableColumns
					.slice( 0, 2 )
					.map( ( column ) => ( { key: column.key, sortable: true } ) )
			: DEFAULT_COLUMNS;

	// Drop selections that don't exist for the (possibly new) post type or
	// model, e.g. meta fields specific to a previously selected post type,
	// or every field from a previously selected model. Columns falls back
	// to defaultColumns if that empties it; an empty facet selection (no
	// filtering) is a perfectly normal state, so it has no such fallback.
	useReconcileFieldList( availableColumns, columns, ( value ) =>
		setAttributes( { columns: value } ), defaultColumns
	);
	// Facets are reconciled against the *displayed* columns, not every
	// available field: a facet only has something to hook into once its
	// field is also a currently displayed column (see FacetsPanel and
	// gateway/facet's own front-end hookup), so a facet whose column gets
	// removed here is dropped automatically rather than left dangling.
	useReconcileFieldList( columns, facets, ( value ) =>
		setAttributes( { facets: value } )
	);

	// FacetsPanel's own toggle list, narrowed two ways: still a displayed
	// column (unchanged reasoning, above), AND now isFilterable -- e.g. a
	// numeric/date field with no useful contains/equals semantics is no
	// longer offered even if it happens to be displayed. See
	// Column_Registry::FILTERABLE_CORE_COLUMNS's own docblock.
	const displayedKeys = columns.map( ( column ) => column.key );
	const selectableFacetColumns = availableColumns.filter(
		( column ) => displayedKeys.includes( column.key ) && column.isFilterable
	);

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Table Settings', 'gateway' ) }>
					<SourceTypeControl
						value={ sourceType }
						onChange={ ( value ) =>
							setAttributes( { sourceType: value } )
						}
					/>
					{ 'collection' === sourceType ? (
						<CollectionControl
							value={ collection }
							onChange={ ( value ) =>
								setAttributes( { collection: value } )
							}
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
				<PanelBody title={ __( 'Columns', 'gateway' ) } initialOpen={ false }>
					<ColumnsPanel
						availableColumns={ availableColumns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						columns={ columns }
						onChange={ ( value ) => setAttributes( { columns: value } ) }
					/>
				</PanelBody>
				{ /* "Filters" here, not "Facets" -- see gateway/data-cards'
				   own edit.js for the full "why" (a direct request to stop
				   sharing this term with the gateway/facet(-has-value)
				   BLOCKS a visitor interacts with). */ }
				<PanelBody title={ __( 'Filters', 'gateway' ) } initialOpen={ false }>
					<FacetsPanel
						availableColumns={ availableColumns }
						selectableColumns={ selectableFacetColumns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						facets={ facets }
						onChange={ ( value ) => setAttributes( { facets: value } ) }
						emptyMessage={ __(
							'Select one or more columns above before adding filters.',
							'gateway'
						) }
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...innerBlocksProps } />
		</>
	);
}
