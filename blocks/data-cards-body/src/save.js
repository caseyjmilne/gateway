/**
 * Save function for the gateway/data-cards-body block.
 *
 * Still a dynamic block -- render.php builds the actual `<ul>` output on
 * every request, entirely from Data_Cards_Renderer::get_current() (never
 * from `$content`), the same reasoning gateway/datatable's own save.js
 * documents: this plain wrapper `<div>` exists only to hold the real
 * InnerBlocks (the user's authored card template) delimiter comments for
 * storage/parsing purposes -- it's never actually output to a visitor.
 * useInnerBlocksProps.save() (not useBlockProps.save()) is what's needed
 * here regardless of the dynamic render, since this is the ONE block in
 * this family whose InnerBlocks are real, user-authored content that must
 * round-trip through post_content, not a fixed set of named children.
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
