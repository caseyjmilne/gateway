import { useBlockProps, useInnerBlocksProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import PostTypeControl from './controls/post-type-control';
import LimitControl from './controls/limit-control';
import PageSizeControl from './controls/page-size-control';
import ColumnsPanel from './controls/columns-panel';
import FacetsPanel from './controls/facets-panel';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from './hooks/use-reconcile-field-list';

const DEFAULT_COLUMNS = [
	{ key: 'ID', sortable: true },
	{ key: 'post_title', sortable: true },
];

export default function Edit( { attributes, setAttributes } ) {
	const { postType, columns, facets } = attributes;
	const blockProps = useBlockProps();

	// The InnerBlocks area: exactly three fixed, named slots -- gateway/
	// datatable-header, gateway/datatable-body, gateway/datatable-footer --
	// each rendering in that same order both here (see below) and on the
	// front end (render.php echoes them in this order unconditionally,
	// regardless of inner block order). `templateLock: 'all'` locks this
	// list to exactly that skeleton: no inserting, removing, or reordering
	// at this level, since there's no state where showing them out of order
	// (or missing one) would make sense -- Body always needs to be able to
	// show the table, Header/Footer always render where their names say.
	// (Their own *nested* InnerBlocks -- gateway/facet inside the Header,
	// gateway/pagination/gateway/datatable-results inside the Footer -- stay
	// freely editable; this lock only applies to this one, outermost level.)
	// Because Body is a genuine sibling block here, rendered in its own
	// right (see its own edit.js), the editor's visual order now matches
	// the front end exactly -- Header, then the table, then Footer -- rather
	// than the table only appearing separately, below this list, via a
	// <ServerSideRender> of the whole parent (which is what previously made
	// Header/Footer both appear to sit "above" the table while editing).
	const innerBlocksProps = useInnerBlocksProps(
		blockProps,
		{
			allowedBlocks: [
				'gateway/datatable-header',
				'gateway/datatable-body',
				'gateway/datatable-footer',
			],
			template: [
				[ 'gateway/datatable-header', {} ],
				[ 'gateway/datatable-body', {} ],
				[
					'gateway/datatable-footer',
					{},
					[ [ 'gateway/pagination', {} ], [ 'gateway/datatable-results', {} ] ],
				],
			],
			templateLock: 'all',
		}
	);

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
