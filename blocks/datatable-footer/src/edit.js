import {
	useBlockProps,
	useInnerBlocksProps,
	InnerBlocks,
} from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/pagination --
 * no settings of its own, so no InspectorControls.
 */
export default function Edit() {
	const blockProps = useBlockProps();
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/pagination' ],
		renderAppender: InnerBlocks.ButtonBlockAppender,
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
