import {
	useBlockProps,
	useInnerBlocksProps,
	InnerBlocks,
} from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/facet --
 * no settings of its own, so no InspectorControls.
 *
 * `useBlockProps( { className: 'gateway-datatable-facets' } )` -- see
 * gateway/datatable-footer's own edit.js for why this, not bare
 * `useBlockProps()`, is what actually makes `style.scss`'s flex layout
 * apply in the editor at all: `save.js` passes that className to its own
 * `useBlockProps.save()`; this file didn't, so the editor's wrapper never
 * carried the one class `style.scss` targets.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-datatable-facets' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/facet' ],
		renderAppender: InnerBlocks.ButtonBlockAppender,
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
