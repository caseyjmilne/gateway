/**
 * Save function for the gateway/datatable block.
 *
 * Still a dynamic block -- render.php builds the actual `<table>` markup on
 * every request, so this deliberately does *not* use useBlockProps.save()
 * (which would emit its own wrapper `<div>`; render.php's
 * get_block_wrapper_attributes() call already produces that wrapper, and
 * having both would double it up). All that needs to persist into
 * post_content is the InnerBlocks (gateway/facet children) markup, which
 * render.php receives as `$content` and outputs above the table.
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	// The className here is what render.php's $content ends up wrapped in,
	// so it's set here rather than by render.php adding its own extra
	// wrapper around $content.
	const innerBlocksProps = useInnerBlocksProps.save( {
		className: 'gateway-datatable-facets',
	} );

	return <div { ...innerBlocksProps } />;
}
