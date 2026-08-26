import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/data-cards
 * -page-size and gateway/data-cards-search -- no settings of its own, so
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
		],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
