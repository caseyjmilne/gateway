import { useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Save function for the gateway/single-record block -- still a dynamic
 * block (render.php rebuilds real output on every request from the
 * actually-resolved record, never from this saved markup); this plain
 * wrapper only exists to hold the real, user-authored InnerBlocks
 * delimiter comments for storage, same reasoning as every other dynamic
 * InnerBlocks wrapper in this plugin (e.g. gateway/related-items' own
 * save.js).
 */
export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save();

	return <div { ...innerBlocksProps } />;
}
