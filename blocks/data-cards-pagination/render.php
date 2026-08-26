<?php
/**
 * Server-side render for the gateway/data-cards-pagination block.
 *
 * Unlike gateway/pagination (an empty skeleton until DataTables exists
 * client-side and view.js can ask it for the real page count), this block
 * already knows everything it needs at PHP-render time: gateway/
 * data-cards/render.php -- the one common ancestor this block, gateway/
 * data-cards-body, and gateway/data-cards-results all share -- already
 * ran the query and computed pager metadata once, and stashed it via
 * Data_Cards_Renderer::set_current() (see that block's own render.php and
 * Data_Cards_Renderer's own docblock for why). Real Previous/Next/page
 * -number buttons, already reflecting the real page count, render here
 * directly -- src/view.js only adds the click-to-fetch wiring on top of
 * already-correct, already-visible markup.
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

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-pagination' ) );
$page_window         = \Gateway\Data_Cards_Renderer::build_page_window( $state['page'], $state['pages'] );
?>
<nav <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-label="<?php esc_attr_e( 'Grid pagination', 'gateway' ); ?>">
	<button
		type="button"
		class="gateway-data-cards-pagination__prev"
		<?php disabled( $state['page'] <= 0 ); ?>
	>
		<?php esc_html_e( 'Previous', 'gateway' ); ?>
	</button>
	<span class="gateway-data-cards-pagination__pages">
		<?php foreach ( $page_window as $entry ) : ?>
			<?php if ( 'ellipsis-start' === $entry || 'ellipsis-end' === $entry ) : ?>
				<span class="gateway-data-cards-pagination__ellipsis" aria-hidden="true">&hellip;</span>
			<?php else : ?>
				<button
					type="button"
					class="gateway-data-cards-pagination__page<?php echo $entry === $state['page'] ? ' is-current' : ''; ?>"
					data-page="<?php echo esc_attr( $entry ); ?>"
					<?php echo $entry === $state['page'] ? 'aria-current="page"' : ''; ?>
				>
					<?php echo esc_html( $entry + 1 ); ?>
				</button>
			<?php endif; ?>
		<?php endforeach; ?>
	</span>
	<button
		type="button"
		class="gateway-data-cards-pagination__next"
		<?php disabled( $state['page'] >= $state['pages'] - 1 ); ?>
	>
		<?php esc_html_e( 'Next', 'gateway' ); ?>
	</button>
</nav>
