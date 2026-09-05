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
 * `fieldKeys` -- an OPTIONAL "only parse these fields" restriction
 * (edit.js's own `FormTokenField`, offering the active Collection's own
 * fields) -- narrows the scan from "every heading anywhere in this
 * panel" down to "only headings found within one of these specific
 * fields' own rendered value" (concretely: inside a
 * `gateway/card-field-text` instance whose own `data-field-key` matches
 * one of them -- see that block's own render.php). A hand-placed
 * `core/heading`, or a heading from an unrelated `gateway/related-items`
 * loop, is deliberately excluded once this is configured -- that's the
 * whole point of naming specific fields. Re-validated here against
 * $collection's own CURRENT, real columns before ever reaching view.js
 * -- a stale key (a field since renamed/removed) is silently dropped,
 * the same "never trust a stored attribute blindly" discipline
 * `gateway/card-field-text`'s own `fieldKey` re-validation and
 * `Model_Fields::resolve_orderby()` already apply elsewhere. Passed
 * through as a plain comma-joined `data-field-keys` attribute (empty
 * string when unrestricted) -- a block attribute only ever exists in
 * the EDITOR's own JS runtime; the front end has no way to read
 * `$attributes` back out except whatever render.php actually printed
 * into the DOM for view.js to find. Real field names can never contain
 * a comma (`Model_Fields`' own naming rules), so no further encoding is
 * needed.
 *
 * $collection itself comes from `$block->context['record']` -- NOT
 * `$block->context['gateway/data-cards/collection']`, even though
 * `usesContext` declares both: this block renders inside the SAME
 * synthetic, per-record wrapper tree gateway/card-field-text's own
 * render.php docblock describes at length, where a real
 * `providesContext` chain (like Data Display's own) never reaches at
 * all -- `collection` would silently read back whatever an ABSENT
 * context key defaults to, not the real value. `record` is the one
 * thing that tree's own `render_block_context` filter actually injects,
 * so `get_class( $record )` is the only reliable way to know the model
 * here, same as `card-field-text` already does. `gateway/data-cards/collection`
 * is declared anyway purely for the EDITOR side (edit.js's own field
 * picker) -- context propagation works normally there, on the real,
 * non-synthetic block tree.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: heading, fieldKeys.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the synthetic per-record wrapper tree.
 */

defined( 'ABSPATH' ) || exit;

$heading = isset( $attributes['heading'] ) && is_string( $attributes['heading'] ) && '' !== trim( $attributes['heading'] )
	? $attributes['heading']
	: __( 'On This Page', 'gateway' );

$record     = $block->context['record'] ?? null;
$collection = ( $record instanceof \Illuminate\Database\Eloquent\Model ) ? get_class( $record ) : '';

$requested_field_keys = isset( $attributes['fieldKeys'] ) && is_array( $attributes['fieldKeys'] )
	? array_values( array_filter( array_map( 'strval', $attributes['fieldKeys'] ) ) )
	: array();

$field_keys = array();

if ( '' !== $collection && ! empty( $requested_field_keys ) ) {
	$valid_keys = wp_list_pluck( \Gateway\Column_Registry::get_columns_for_collection( $collection ), 'key' );
	$field_keys = array_values( array_intersect( $requested_field_keys, $valid_keys ) );
}

$wrapper_attributes = get_block_wrapper_attributes( array(
	'class'           => 'gateway-data-display-toc',
	'data-field-keys' => implode( ',', $field_keys ),
) );
?>
<nav <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-label="<?php echo esc_attr( $heading ); ?>" hidden>
	<p class="gateway-data-display-toc__heading"><?php echo esc_html( $heading ); ?></p>
	<div class="gateway-data-display-toc__list"></div>
</nav>
