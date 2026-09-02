import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/data-cards
 * -page-size, gateway/data-cards-search, and gateway/card-facet (one of
 * the places allowing it here still makes sense to offer explicitly --
 * gateway/card-facet's own block.json now only requires SOME
 * gateway/data-cards ancestor at any depth, not a direct-parent match
 * here specifically, but this block's own `allowedBlocks` is a separate,
 * narrower restriction of its own choosing) -- no settings of its own, so
 * no InspectorControls. Direct copy of gateway/datatable-header's own
 * edit.js, renamed -- see that file's docblock for why `renderAppender`
 * is deliberately left unset, and why `className` is passed to
 * `useBlockProps()` here (not just `save.js`'s `useBlockProps.save()`).
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-header' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [
			'gateway/data-cards-page-size',
			'gateway/data-cards-search',
			'gateway/card-facet',
		],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
