import { useRef } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import PostTypeControl from './controls/post-type-control';
import LimitControl from './controls/limit-control';
import PageSizeControl from './controls/page-size-control';
import ColumnsPanel from './controls/columns-panel';
import { useDataTableInit } from './hooks/use-datatable-init';

export default function Edit( { attributes, setAttributes } ) {
	const { postType, limit, pageSize, columns } = attributes;
	const blockProps = useBlockProps();
	const previewRef = useRef();

	// Re-run whenever the rendered preview could change shape/content --
	// including a column change (add/remove/reorder/sortable toggle), which
	// is the event that should refresh the DataTable in the editor.
	useDataTableInit( previewRef, [
		postType,
		limit,
		pageSize,
		JSON.stringify( columns ),
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
						postType={ postType }
						columns={ columns }
						onChange={ ( value ) => setAttributes( { columns: value } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<div { ...blockProps }>
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
