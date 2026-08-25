/**
 * Save function for the gateway/datatable block.
 *
 * Still a dynamic block -- render.php builds the actual `<table>` markup on
 * every request, so this deliberately does *not* use useBlockProps.save()
 * (which would emit its own wrapper `<div>`; render.php's
 * get_block_wrapper_attributes() call already produces that wrapper, and
 * having both would double it up). All that needs to persist into
 * post_content is the InnerBlocks (gateway/facet and gateway/pagination
 * children) delimiter comments -- this wrapper `<div>` exists only to hold
 * those for storage/parsing purposes.
 *
 * Its className is cosmetic as far as rendering goes: render.php doesn't
 * use the `$content` this produces at all (it renders each inner block
 * itself, split by type, into two different positions -- facets above the
 * table, pagination below it -- since a single flat $content string can't
 * represent two different positions; see render.php's own comment). This
 * div is never actually output to a visitor.
 */

import { useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const innerBlocksProps = useInnerBlocksProps.save( {
		className: 'gateway-datatable-facets',
	} );

	return <div { ...innerBlocksProps } />;
}
