<?php
/**
 * Server-side render for the gateway/data-display-toc block.
 *
 * Same "render.php can't compute the real thing, view.js reads what's
 * already on the page instead" shape as its sibling
 * gateway/data-display-prev-next (see that block's own render.php
 * docblock for the fuller version of this reasoning) -- for an even
 * more fundamental reason here: a Table of Contents needs to know every
 * HEADING that ends up in the currently active child's own rendered
 * content, and that content is built by whatever OTHER blocks a site
 * owner has placed in the same detail template (a WYSIWYG field's own
 * `card-field-text`, a hand-placed `core/heading`, `gateway/related-items`
 * looping its own template full of headings, ...) -- sibling blocks in
 * the same InnerBlocks tree render independently, with no shared access
 * to each other's own output, so there is no PHP-side hook this block
 * could use to see what any of them are about to produce even if it
 * wanted to.
 *
 * The real technique, entirely in view.js, once the FULL page (every
 * sibling block included) actually exists in the DOM: find this
 * instance's own enclosing `.gateway-data-display__panel`, scan it for
 * every `h2`–`h6`, assign each one a real, unique `id` (`{panel's own
 * child slug}--{slugified heading text}`, a real anchor -- an existing
 * `id` a site owner already set by hand via the block editor's own
 * "HTML anchor" field is always left alone), and build one indented
 * nested list of real `<a href="#...">` links from them -- clicking one
 * is a plain, native browser anchor jump; Data Display's OWN hashbang
 * scheme (`#!/...`) only ever reacts to a hash starting with `#!` (see
 * that block's own view.js `parseHash()`), so a plain `#heading-id`
 * hash never gets mistaken for a child-switch request.
 *
 * Like gateway/data-display-prev-next, this only ever needs to run
 * ONCE, on load, never again: which record a given instance's own panel
 * represents (and therefore which headings exist inside it) never
 * changes after the page renders -- only which PANEL is currently
 * VISIBLE does, already handled entirely by gateway/data-display's own
 * existing view.js.
 *
 * Starts `hidden` -- unhidden by view.js only once it actually finds at
 * least one heading to list; an article with no headings at all simply
 * never shows an empty "On This Page" box.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: heading.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$heading = isset( $attributes['heading'] ) && is_string( $attributes['heading'] ) && '' !== trim( $attributes['heading'] )
	? $attributes['heading']
	: __( 'On This Page', 'gateway' );

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-display-toc' ) );
?>
<nav <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-label="<?php echo esc_attr( $heading ); ?>" hidden>
	<p class="gateway-data-display-toc__heading"><?php echo esc_html( $heading ); ?></p>
	<div class="gateway-data-display-toc__list"></div>
</nav>
