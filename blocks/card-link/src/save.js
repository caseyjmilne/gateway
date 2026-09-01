import { useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Save function for the gateway/card-link block -- still a dynamic block
 * (render.php builds the real `<a>`, or no wrapper at all, fresh on
 * every request -- see that file's own docblock); this plain wrapper
 * only exists to hold the real, user-authored InnerBlocks delimiter
 * comments for storage, same reasoning as every other dynamic InnerBlocks
 * wrapper in this plugin (e.g. gateway/single-record's own save.js).
 */
export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
