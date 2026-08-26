<?php
/**
 * Server-side render for the gateway/data-cards-header block.
 *
 * A single-slot InnerBlocks wrapper for the Data Cards' Page Size and
 * Search controls -- always rendered above the grid, by construction
 * (it's the only place in the parent's InnerBlocks area gateway/
 * data-cards-page-size and gateway/data-cards-search are allowed to live;
 * see each one's own "parent" restriction in its block.json). Direct copy
 * of gateway/datatable-header's own render.php, renamed -- see that
 * file's docblock for why $content is unused and every child is filtered
 * by name explicitly instead.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Unused -- see above.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$allowed_names = array( 'gateway/data-cards-page-size', 'gateway/data-cards-search' );
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

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-header' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each allowed child's own escaped output. ?>
</div>
