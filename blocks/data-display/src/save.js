/**
 * Save function for the gateway/data-display block.
 *
 * Still a dynamic block -- render.php builds the actual sidebar/main-pane
 * markup on every request, once per group/child, entirely from real
 * Eloquent records (never from `$content`), the same reasoning
 * gateway/data-cards-body's own save.js documents: this plain wrapper
 * exists only to hold the real InnerBlocks (the user's authored child
 * detail template) delimiter comments for storage/parsing purposes --
 * it's never actually output to a visitor. useInnerBlocksProps.save()
 * (not useBlockProps.save()) is what's needed here, since this block's
 * InnerBlocks are real, user-authored content that must round-trip
 * through post_content, not a fixed set of named children.
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
