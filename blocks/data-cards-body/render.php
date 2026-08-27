<?php
/**
 * Server-side render for the gateway/data-cards-body block.
 *
 * Unlike gateway/datatable-body (which runs its own WP_Query and builds
 * its own <table> entirely independently), this block's render.php does
 * almost nothing itself: gateway/data-cards/render.php -- the one common
 * ancestor Body, Pagination, and Results all share -- already ran the
 * query, rendered every card, and computed pager metadata ONCE, and
 * stashed it via Data_Cards_Renderer::set_current() right before
 * dispatching this block. This just reads that back and renders it.
 *
 * A single <ul> carries both the wrapper/layout-support classes (via
 * get_block_wrapper_attributes(), which also applies this block's
 * `supports.layout` grid styling -- see block.json) and this instance's
 * own data-* attributes -- matching WordPress core's own
 * render_block_core_post_template() structure (`<ul %wrapper%>%items%</ul>`,
 * confirmed by reading packages/block-library/src/post-template/index.php
 * directly) rather than an extra nested wrapping <div>, so the grid
 * -layout classes land on the actual element that needs to become a CSS
 * grid, not a container around it. shared/cards.js's whole front-end
 * contract (findCardsGridElement()/fetchCardsPage()/renderCardsPage()) is
 * built around this one element carrying everything.
 *
 * Explicit esc_attr() on each data attribute below, not
 * get_block_wrapper_attributes()'s own $extra_attributes -- matches
 * gateway/datatable-body's own render.php, which builds its <table> tag
 * manually the same way, for the same reason: this repo's own established
 * pattern for anything beyond a plain class list.
 *
 * @package Gateway
 *
 * @var array    $attributes Unused (this block has no attributes of its own).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$state = \Gateway\Data_Cards_Renderer::get_current();

if ( ! $state ) {
	// Rendered outside a gateway/data-cards parent (e.g. moved out via
	// List View, or previewed standalone through the block-renderer REST
	// endpoint) -- there's no query result to show, so render nothing
	// rather than guessing at one.
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-grid' ) );
?>
<ul
	<?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
	data-source-type="<?php echo esc_attr( $state['source_type'] ?? 'postType' ); ?>"
	data-post-type="<?php echo esc_attr( $state['post_type'] ?? '' ); ?>"
	data-collection="<?php echo esc_attr( $state['collection'] ?? '' ); ?>"
	data-page-size="<?php echo esc_attr( $state['page_size'] ); ?>"
	data-limit="<?php echo esc_attr( $state['limit'] ); ?>"
	data-template-id="<?php echo esc_attr( $state['template_id'] ); ?>"
	data-rest-url="<?php echo esc_url( $state['rest_url'] ); ?>"
	data-page="<?php echo esc_attr( $state['page'] ); ?>"
	data-pages="<?php echo esc_attr( $state['pages'] ); ?>"
	data-start="<?php echo esc_attr( $state['start'] ); ?>"
	data-end="<?php echo esc_attr( $state['end'] ); ?>"
	data-records-display="<?php echo esc_attr( $state['recordsDisplay'] ); ?>"
	data-records-total="<?php echo esc_attr( $state['recordsTotal'] ); ?>"
	data-search=""
><?php echo $state['html']; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- render_items()'s own per-post rendered block markup, already escaped by each inner block's own render. ?></ul>
