<?php
/**
 * Server-side render for the gateway/datatable-header block.
 *
 * A single-slot InnerBlocks wrapper for the Data Table's Page Size and
 * Search controls -- always rendered above the grid, by construction
 * (it's the only place in the parent's InnerBlocks area gateway/
 * datatable-page-size and gateway/datatable-search are allowed to live;
 * see each one's own "parent" restriction in its block.json). Facets used
 * to live here too; they moved to their own gateway/datatable-facets
 * block, rendered above this one -- see gateway/datatable's own
 * render.php.
 *
 * Unlike gateway/datatable's own render.php, this block has no hardcoded
 * markup of its own to interleave content around, so it doesn't need the
 * inner-block-splitting treatment that block's render.php uses -- $content
 * (already including this block's own save()-produced wrapper <div>, with
 * every child rendered inside it) is exactly the right output as-is.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Rendered InnerBlocks content (gateway/datatable-page-size and gateway/datatable-search children), pre-wrapped by save.js.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

// Nothing configured -- render nothing at all, not an empty box, on the
// front end. (The editor still shows this block's own frame regardless,
// per normal InnerBlocks editing UX -- see style.scss's min-height.)
if ( 0 === count( $block->inner_blocks ) ) {
	return;
}

echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- save.js's own wrapper + each child's own escaped output.
