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
 * markup of its own to interleave content around, so it doesn't render
 * $content's children individually to reposition them -- but it does
 * still filter by name before rendering anything at all (see below),
 * rather than trusting $content -- WordPress's own unconditional
 * concatenation of every child's markup -- wholesale.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Unused -- see below.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

// $content isn't used here (unusually for a block with no zones of its own
// to interleave around): "parent"/"allowedBlocks" only ever stop the
// *inserter* from offering a disallowed child -- neither one strips a
// block that already ended up here some other way (older content saved
// under an earlier version of this restriction, or a block moved in
// directly via List View, which isn't gated the same way as the main
// inserter). Rendering each child by name explicitly, the same defensive
// pattern gateway/datatable's own render.php already uses for its four
// zones, means this block can only ever show Page Size and Search, no
// matter what its actual saved inner blocks contain.
$allowed_names = array( 'gateway/datatable-page-size', 'gateway/datatable-search' );
$markup        = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( in_array( $inner_block->name, $allowed_names, true ) ) {
		$markup .= $inner_block->render();
	}
}

if ( '' === $markup ) {
	// Nothing (allowed) configured -- render nothing at all, not an empty
	// box, on the front end. (The editor still shows this block's own
	// frame regardless, per normal InnerBlocks editing UX -- see
	// style.scss's min-height.)
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-header' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each allowed child's own escaped output. ?>
</div>
