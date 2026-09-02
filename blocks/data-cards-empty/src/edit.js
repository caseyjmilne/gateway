import { useBlockProps, useInnerBlocksProps, InnerBlocks } from '@wordpress/block-editor';

/**
 * An editable InnerBlocks container with NO allowed-blocks restriction --
 * unlike gateway/data-cards-header/-footer (each locked to a specific
 * small set of sibling widgets), this zone is meant for "anything" (a
 * message, an image, a button, ...), per a direct request: "anything
 * inside that we show only if cards empty." `renderAppender` is a real
 * button appender (not left unset the way Header/Footer's own docblocks
 * explain for THEIR restricted single-slot shape) since an empty state
 * message is exactly the kind of thing a site owner starts from a blank
 * block, the same reasoning gateway/datatable-facets' own edit.js
 * already gives for its own ButtonBlockAppender.
 *
 * No settings of its own, so no InspectorControls -- same as every other
 * plain zone in this family.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-empty' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		renderAppender: InnerBlocks.ButtonBlockAppender,
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
