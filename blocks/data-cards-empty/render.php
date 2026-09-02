<?php
/**
 * Server-side render for the gateway/data-cards-empty block.
 *
 * A direct request: "we need to show an 'empty' block when cards are
 * cleared instead of showing nothing as we do now... give the user the
 * ability to setup a block for it... add this as a direct child of data
 * cards 'Data Cards Empty' and anything inside that we show only if
 * cards empty." Unlike gateway/data-cards-header/-footer (each locked to
 * a specific small set of sibling widgets, filtered by name off
 * `$block->inner_blocks`), this simply echoes `$content` -- the normal
 * WordPress dynamic-block shape, exactly like gateway/single-record's own
 * render.php -- since "anything inside" was the whole point; there's no
 * fixed set of allowed children to filter against.
 *
 * gateway/data-cards/render.php dispatches this the same way it dispatches
 * Header/Body/Footer -- by name, via `$inner_block->render()` -- reading
 * `Data_Cards_Renderer::get_current()` back the same way gateway/
 * data-cards-body/render.php already does for the grid itself.
 *
 * **Always rendered when there's anything configured inside it at all**
 * -- regardless of whether the grid is CURRENTLY empty -- with a
 * `--hidden` class added whenever it isn't. This is deliberate, not an
 * oversight: gateway/data-cards-search/-facet/-pagination/-page-size can
 * all change which records match *without a full page reload*, purely
 * via a fetch (see shared/cards.js's fetchCardsPage()/renderCardsPage()),
 * and this block's own content is never re-rendered by that fetch (its
 * own REST response only ever carries the grid's `<li>` markup + pager
 * counts, never a second copy of arbitrary user-authored content that
 * doesn't depend on which record matched anyway). So this block's own
 * markup is rendered exactly ONCE, up front, and src/view.js toggles the
 * SAME `--hidden` class on every later 'gatewaycards:update' event
 * instead -- the front-end equivalent of gateway/data-cards-results'/
 * `-pagination`'s own "rendered once server-side, kept in sync by
 * view.js from then on" shape, just toggling visibility instead of
 * rewriting text.
 *
 * The initial class here still matters even though view.js reconciles it
 * again on mount -- same "real initial state, not a flash of the wrong
 * one" reasoning Data_Cards_Renderer's own docblock already gives for
 * computing real pager counts up front rather than an empty skeleton: a
 * visitor whose JS hasn't finished loading yet (or has it disabled
 * entirely) still sees the right thing immediately.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Already-rendered InnerBlocks output -- arbitrary, user-authored.
 * @var WP_Block $block      Block instance (unused -- no context read here).
 */

defined( 'ABSPATH' ) || exit;

$state = \Gateway\Data_Cards_Renderer::get_current();

if ( ! $state ) {
	// Rendered outside a gateway/data-cards parent (e.g. moved out via
	// List View, or previewed standalone through the block-renderer REST
	// endpoint) -- there's no query result to judge "empty" against, so
	// render nothing rather than guessing at one. Same reasoning gateway/
	// data-cards-body/render.php's own docblock already gives for its
	// identical early return.
	return;
}

if ( '' === trim( (string) $content ) ) {
	// Nothing configured inside this zone at all -- render nothing on the
	// front end, same "no empty box" convention gateway/data-cards-header/
	// -footer's own render.php already follow for an unconfigured zone.
	return;
}

$is_currently_empty = 0 === (int) ( $state['recordsTotal'] ?? 0 );

$wrapper_attributes = get_block_wrapper_attributes( array(
	'class' => 'gateway-data-cards-empty' . ( $is_currently_empty ? '' : ' gateway-data-cards-empty--hidden' ),
) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></div>
