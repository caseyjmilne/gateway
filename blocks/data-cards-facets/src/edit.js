import {
	useBlockProps,
	useInnerBlocksProps,
	InnerBlocks,
} from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/card-facet
 * -- no settings of its own, so no InspectorControls. Direct copy of
 * gateway/datatable-facets' own edit.js, renamed -- see that file's
 * docblock for why `className` is passed to `useBlockProps()` here (not
 * just `save.js`'s `useBlockProps.save()`).
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-facets' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/card-facet' ],
		renderAppender: InnerBlocks.ButtonBlockAppender,
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
