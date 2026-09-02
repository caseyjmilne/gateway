import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/
 * data-cards-pagination, gateway/data-cards-results, and gateway/
 * card-facet (gateway/card-facet's own block.json now only requires SOME
 * gateway/data-cards ancestor at any depth, not a direct-parent match
 * here specifically, but this block's own `allowedBlocks` is a separate,
 * narrower restriction of its own choosing) -- no settings of its own,
 * so no InspectorControls. Direct copy of gateway/datatable
 * -footer's own edit.js, renamed -- see that file's docblock for why
 * `renderAppender` is deliberately left unset, and why `className` is
 * passed to `useBlockProps()` here (not just `save.js`'s
 * `useBlockProps.save()`).
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-footer' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [
			'gateway/data-cards-pagination',
			'gateway/data-cards-results',
			'gateway/card-facet',
		],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
