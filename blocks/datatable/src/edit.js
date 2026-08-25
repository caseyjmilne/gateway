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

	// The facets bar: only gateway/facet blocks, sitting at the top of the
	// block (rendered here, above the preview below -- and, on the front
	// end, render.php echoes this same InnerBlocks markup, as $content,
	// above the <table> for the same reason).
	const innerBlocksProps = useInnerBlocksProps(
		{ className: 'gateway-datatable-facets' },
		{
			allowedBlocks: [ 'gateway/facet' ],
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
