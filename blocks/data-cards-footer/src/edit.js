import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/
 * data-cards-pagination, gateway/data-cards-results, and gateway/
 * card-facet (one of this block's three allowed homes -- see that
 * block's own "parent" restriction in its block.json) -- no settings of
 * its own, so no InspectorControls. Direct copy of gateway/datatable
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
