import { useRef } from '@wordpress/element';
import {
	useBlockProps,
	useInnerBlocksProps,
	InspectorControls,
	InnerBlocks,
} from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import PostTypeControl from './controls/post-type-control';
import LimitControl from './controls/limit-control';
import PageSizeControl from './controls/page-size-control';
import ColumnsPanel from './controls/columns-panel';
import FacetsPanel from './controls/facets-panel';
import { useDataTableInit } from './hooks/use-datatable-init';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useReconcileFieldList } from './hooks/use-reconcile-field-list';

const DEFAULT_COLUMNS = [
	{ key: 'ID', sortable: true },
	{ key: 'post_title', sortable: true },
];

export default function Edit( { attributes, setAttributes } ) {
	const { postType, limit, pageSize, columns, facets } = attributes;
	const blockProps = useBlockProps();
	const previewRef = useRef();

	// The InnerBlocks area: exactly two container blocks, gateway/datatable
	// -header and gateway/datatable-footer -- each with its own nested
	// InnerBlocks area (gateway/facet inside the header, gateway/pagination
	// inside the footer; see each block's own "parent" restriction). `template`
	// seeds a brand-new datatable block with both, the footer pre-populated
	// with a Pagination child, so a site owner gets working pagination without
	// having to know to add anything; `templateLock: false` leaves them free
	// to remove or rearrange either afterward. Editing still happens in this
	// one area, above the <ServerSideRender> preview below (a Gutenberg
	// limitation, not something header/footer changes -- see render.php's own
	// comment on the parent block for why), but *which* facet/pagination
	// controls end up above vs. below the table is no longer ambiguous the
	// way it was when both lived in one shared, type-inferred list: a block
	// literally named "Header" or "Footer" makes that unambiguous on its own.
	const innerBlocksProps = useInnerBlocksProps(
		{},
		{
			allowedBlocks: [
				'gateway/datatable-header',
				'gateway/datatable-footer',
			],
			template: [
				[ 'gateway/datatable-header', {} ],
				[
					'gateway/datatable-footer',
					{},
					[ [ 'gateway/pagination', {} ] ],
				],
			],
			renderAppender: InnerBlocks.ButtonBlockAppender,
			templateLock: false,
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

	// Re-run whenever the rendered preview could change shape/content --
	// including a column or facet change (add/remove/reorder/sortable
	// toggle, or a facet's compare/value), which is the event that should
	// refresh the DataTable in the editor.
	useDataTableInit( previewRef, [
		postType,
		limit,
		pageSize,
		JSON.stringify( columns ),
		JSON.stringify( facets ),
	] );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Table Settings', 'gateway' ) }>
					<PostTypeControl
						value={ postType }
						onChange={ ( value ) => setAttributes( { postType: value } ) }
					/>
					<LimitControl
						value={ limit }
						onChange={ ( value ) => setAttributes( { limit: value } ) }
					/>
					<PageSizeControl
						value={ pageSize }
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
			<div { ...blockProps }>
				<div { ...innerBlocksProps } />
				<div className="gateway-datatable-preview" ref={ previewRef }>
					<ServerSideRender
						block="gateway/datatable"
						attributes={ attributes }
					/>
				</div>
			</div>
		</>
	);
}
