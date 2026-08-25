/**
 * Save function for the gateway/datatable block.
 *
 * Still a dynamic block -- render.php builds the actual `<table>` markup on
 * every request, so this deliberately does *not* use useBlockProps.save()
 * (which would emit its own wrapper `<div>`; render.php's
 * get_block_wrapper_attributes() call already produces that wrapper, and
 * having both would double it up). All that needs to persist into
 * post_content is the InnerBlocks (gateway/datatable-header and gateway/
 * datatable-footer) delimiter comments -- this wrapper `<div>` exists only
 * to hold those for storage/parsing purposes; it's never actually output
 * to a visitor. render.php doesn't use the `$content` this produces at
 * all -- it renders the header/footer blocks itself, into two different
 * positions around the table (see render.php's own comment).
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
