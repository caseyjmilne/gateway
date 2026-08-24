import { useRef } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import PostTypeControl from './controls/post-type-control';
import LimitControl from './controls/limit-control';
import { useDataTableInit } from './hooks/use-datatable-init';

export default function Edit( { attributes, setAttributes } ) {
	const { postType, limit } = attributes;
	const blockProps = useBlockProps();
	const previewRef = useRef();

	// Re-run whenever the rendered preview could change shape/content.
	useDataTableInit( previewRef, [ postType, limit ] );

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
