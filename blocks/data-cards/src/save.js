/**
 * Save function for the gateway/data-cards block.
 *
 * Still a dynamic block -- render.php builds the actual output on every
 * request (see its own docblock for why it does the real query/render
 * work itself, unlike gateway/datatable's own render.php). Same reasoning
 * as gateway/datatable's own save.js: no useBlockProps.save() (render.php's
 * get_block_wrapper_attributes() call already produces the real wrapper),
 * just enough to persist the three named children's InnerBlocks delimiter
 * comments into post_content.
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
