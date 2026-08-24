import { useRef } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ServerSideRender from '@wordpress/server-side-render';

import PostTypeControl from './controls/post-type-control';
import { useDataTableInit } from './hooks/use-datatable-init';

export default function Edit( { attributes, setAttributes } ) {
	const { postType } = attributes;
	const blockProps = useBlockProps();
	const previewRef = useRef();

	// Re-run whenever the rendered preview could change shape/content.
	useDataTableInit( previewRef, [ postType ] );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Data Table Settings', 'gateway' ) }>
					<PostTypeControl
						value={ postType }
						onChange={ ( value ) => setAttributes( { postType: value } ) }
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
