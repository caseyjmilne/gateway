<?php
/**
 * Server-side render for the gateway/data-cards-facets block.
 *
 * A single-slot InnerBlocks wrapper for the Data Cards' filter (Card
 * Facet) controls -- the *encouraged* home for gateway/card-facet
 * blocks, always rendered above everything else (Header, Body, Footer)
 * when used, by construction (it's the only place in the parent's
 * InnerBlocks area gateway/card-facet is allowed to live alongside
 * gateway/data-cards itself, -header, and -footer -- see gateway/card
 * -facet's own "parent" restriction in its block.json). Direct copy of
 * gateway/datatable-facets' own render.php, renamed -- see that file's
 * docblock for why $content is unused and every child is filtered by
 * name explicitly instead.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Unused -- see above.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$markup = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( 'gateway/card-facet' === $inner_block->name ) {
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

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-facets' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each gateway/card-facet child's own escaped output. ?>
</div>
