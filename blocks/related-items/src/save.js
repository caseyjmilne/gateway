/**
 * Save function for the gateway/related-items block.
 *
 * Still a dynamic block -- render.php builds the actual `<ul>`/`<li>`
 * output on every request, once per related record, entirely from the
 * real Eloquent record in context (never from `$content`), the same
 * reasoning gateway/data-cards-body's own save.js documents: this plain
 * wrapper exists only to hold the real InnerBlocks (the user's authored
 * per-item template) delimiter comments for storage/parsing purposes --
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
