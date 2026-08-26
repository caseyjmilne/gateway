<?php
/**
 * Server-side render for the gateway/data-cards-results block.
 *
 * Unlike gateway/datatable-results (an empty skeleton until DataTables
 * exists client-side), this block already knows everything it needs at
 * PHP-render time -- see gateway/data-cards-pagination/render.php's own
 * docblock for why (the same Data_Cards_Renderer::get_current() state,
 * computed once by gateway/data-cards/render.php). The real "Showing X to
 * Y of Z entries" text renders here directly.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$state = \Gateway\Data_Cards_Renderer::get_current();

if ( ! $state ) {
	// Rendered outside a gateway/data-cards parent -- no pager state to
	// show (see gateway/data-cards-body/render.php's identical guard).
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-results' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-live="polite">
	<?php echo esc_html( \Gateway\Data_Cards_Renderer::build_info_text( $state ) ); ?>
</div>
