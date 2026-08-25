<?php
/**
 * Server-side render for the gateway/datatable-facets block.
 *
 * A single-slot InnerBlocks wrapper for the Data Table's filter (Facet)
 * controls -- always rendered above everything else (Header, Body,
 * Footer), by construction (it's the only place in the parent's
 * InnerBlocks area gateway/facet is allowed to live; see gateway/facet's
 * own "parent" restriction in its block.json).
 *
 * Unlike gateway/datatable's own render.php, this block has no hardcoded
 * markup of its own to interleave content around, so it doesn't need the
 * inner-block-splitting treatment that block's render.php uses -- $content
 * (already including this block's own save()-produced wrapper <div>, with
 * every gateway/facet child rendered inside it) is exactly the right output
 * as-is.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Rendered InnerBlocks content (gateway/facet children), pre-wrapped by save.js.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

// No facets configured -- render nothing at all, not an empty box, on the
// front end. (The editor still shows this block's own frame regardless,
// per normal InnerBlocks editing UX -- see style.scss's min-height.)
if ( 0 === count( $block->inner_blocks ) ) {
	return;
}

echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- save.js's own wrapper + each gateway/facet child's own escaped output.
