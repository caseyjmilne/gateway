<?php
/**
 * Server-side render for the gateway/datatable-facets block.
 *
 * A single-slot InnerBlocks wrapper for the Data Table's filter (Facet)
 * controls -- always rendered above everything else (Header, Body,
 * Footer).
 *
 * Simply echoes `$content` -- the normal WordPress dynamic-block shape,
 * exactly like gateway/data-cards-empty's/gateway/single-record's own
 * render.php -- rather than filtering `$block->inner_blocks` down to a
 * fixed set of allowed names first. An earlier version filtered by name
 * (only ever rendering a literal `gateway/facet` child, later widened to
 * also include `gateway/facet-has-value`), on the reasoning that this is
 * "the same defensive pattern gateway/datatable's own render.php already
 * uses for its four zones" -- but that parent's own case is different:
 * it's choosing WHERE among several fixed zones a batch of named children
 * belongs, never excluding one outright. Here there's only one zone and
 * nothing to interleave around, so filtering by name only ever meant
 * silently dropping anything not on the list -- including, in practice, a
 * newly-added sibling facet type this file's own allow-list had no way of
 * knowing about ahead of time (confirmed directly: `gateway/facet
 * -has-value` produced NO output at all here, not even an empty wrapper,
 * until that one name was added by hand). Per a direct request ("that
 * exclusion makes no sense if the user can drop a block in it should
 * render") this is now unconditional: whatever a site owner actually
 * places here renders, the same as gateway/data-cards' own equivalent
 * Filters area (a plain, unrestricted core/group) already does.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Already-rendered InnerBlocks output -- arbitrary, user-authored.
 * @var WP_Block $block      Block instance (unused -- no context read here).
 */

defined( 'ABSPATH' ) || exit;

if ( '' === trim( (string) $content ) ) {
	// Nothing configured inside this zone at all -- render nothing on the
	// front end, not an empty box. (The editor still shows this block's
	// own frame regardless, per normal InnerBlocks editing UX -- see
	// style.scss's min-height.)
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-facets' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></div>
