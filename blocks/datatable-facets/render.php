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

// $content isn't used here (unusually for a block with no zone of its own
// to interleave around): "parent" only ever stops the *inserter* from
// offering a disallowed child -- it doesn't strip a block that already
// ended up here some other way (older content saved under an earlier
// version of this restriction, or a block moved in directly via List
// View, which isn't gated the same way as the main inserter). Rendering
// each child by name explicitly, the same defensive pattern gateway/
// datatable's own render.php already uses for its four zones, means this
// block can only ever show gateway/facet/gateway/facet-has-value
// children, no matter what its actual saved inner blocks contain.
//
// gateway/facet-has-value was missing from this allow-list entirely when
// it was first added -- silently skipped here, this block produced NO
// output at all for it (not even an empty wrapper), even though its own
// render.php ran fine on its own and the editor's own preview (which
// never goes through this file) showed it correctly, exactly the
// reported symptom: it "renders as expected in the editor" but "produces
// no output" next to a working gateway/facet on the front end.
$allowed_child_names = array( 'gateway/facet', 'gateway/facet-has-value' );
$markup              = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( in_array( $inner_block->name, $allowed_child_names, true ) ) {
		$markup .= $inner_block->render();
	}
}

if ( '' === $markup ) {
	// No (allowed) facets configured -- render nothing at all, not an
	// empty box, on the front end. (The editor still shows this block's
	// own frame regardless, per normal InnerBlocks editing UX -- see
	// style.scss's min-height.)
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-facets' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each gateway/facet child's own escaped output. ?>
</div>
