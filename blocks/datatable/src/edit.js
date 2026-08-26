import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { createBlock } from '@wordpress/blocks';

import PostTypeControl from '../../shared/controls/post-type-control';
import LimitControl from '../../shared/controls/limit-control';
import PageSizeControl from '../../shared/controls/page-size-control';
import ColumnsPanel from './controls/columns-panel';
import FacetsPanel from './controls/facets-panel';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from './hooks/use-reconcile-field-list';
import { useRequiredInnerBlocks } from '../../shared/hooks/use-required-inner-blocks';

const DEFAULT_COLUMNS = [
	{ key: 'ID', sortable: true },
	{ key: 'post_title', sortable: true },
];

// The entire front-end contract, in order: Facets above everything, Header
// (Page Size + Search) next, then the table itself, then Footer (Results +
// Pagination) -- see render.php's own comment for how this maps to
// DataTables' own default layout. useRequiredInnerBlocks() keeps exactly
// these four present (inserting whichever are missing, without touching
// any that already exist) rather than a locked `template`/`templateLock:
// 'all'` -- see that hook's own docblock for why: an existing block saved
// before a later-added required child (like gateway/datatable-body) would
// otherwise have that new child's position matched, by the built-in
// template sync, against whatever *existing* block already happened to
// sit there -- silently discarding it -- rather than actually inserting
// the new one.
const REQUIRED_BLOCKS = [
	'gateway/datatable-facets',
	'gateway/datatable-header',
	'gateway/datatable-body',
	'gateway/datatable-footer',
];

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
	const { postType, columns, facets } = attributes;
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
		allowedBlocks: REQUIRED_BLOCKS,
		template: [
			[ 'gateway/datatable-facets', {} ],
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

	// Fetched once per post type and shared by both panels below: "what
	// fields are available" is the same question for columns (what to
	// display) and facets (what to filter by).
	const {
		availableColumns,
		isLoading: isLoadingColumns,
		error: columnsError,
	} = useAvailableColumns( postType );

	// Drop selections that don't exist for the (possibly new) post type,
	// e.g. meta fields specific to a previously selected one. Columns falls
	// back to the ID/Title default if that empties it; an empty facet
	// selection (no filtering) is a perfectly normal state, so it has no
	// such fallback.
	useReconcileFieldList( availableColumns, columns, ( value ) =>
		setAttributes( { columns: value } ), DEFAULT_COLUMNS
	);
	// Facets are reconciled against the *displayed* columns, not every
	// available field: a facet only has something to hook into once its
	// field is also a currently displayed column (see FacetsPanel and
	// gateway/facet's own front-end hookup), so a facet whose column gets
	// removed here is dropped automatically rather than left dangling.
	useReconcileFieldList( columns, facets, ( value ) =>
		setAttributes( { facets: value } )
	);

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Table Settings', 'gateway' ) }>
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
				<PanelBody title={ __( 'Columns', 'gateway' ) } initialOpen={ false }>
					<ColumnsPanel
						availableColumns={ availableColumns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						columns={ columns }
						onChange={ ( value ) => setAttributes( { columns: value } ) }
					/>
				</PanelBody>
				<PanelBody title={ __( 'Facets', 'gateway' ) } initialOpen={ false }>
					<FacetsPanel
						availableColumns={ availableColumns }
						displayedColumns={ columns }
						isLoading={ isLoadingColumns }
						error={ columnsError }
						facets={ facets }
						onChange={ ( value ) => setAttributes( { facets: value } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...innerBlocksProps } />
		</>
	);
}
