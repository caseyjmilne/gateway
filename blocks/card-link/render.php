<?php
/**
 * Server-side render for the gateway/card-link block.
 *
 * Structurally the same "synthetic wrapper block" context-reading
 * caveats as gateway/card-field-text/-number/-image's own render.php
 * files -- see gateway/card-field-text/render.php's own docblock for
 * the full reasoning this shares verbatim (never reads
 * 'gateway/data-cards/sourceType'/'gateway/data-cards/collection' here
 * at all -- only the editor's own edit.js needs those, to know whether
 * to fetch this Collection's own Permalink config).
 *
 * The real difference: there's no field to pick at all -- the field
 * (if any) is found AUTOMATICALLY, the same way every other Permalink
 * -aware consumer in this plugin already does (Permalink_Field_Type::
 * max_one_per_model() guarantees a model has at most one, so "the"
 * Permalink field is never ambiguous). `Permalink_Routes::url_for_record()`
 * is the one call that does the whole job: finds the record's own
 * model's Permalink field, confirms it's actually routable (a Root AND
 * Template Page both configured -- Permalink_Routes::routable_models()'s
 * own requirement), reads the record's own current slug, and builds the
 * real, absolute front-end URL -- or returns null the moment any of
 * that isn't true.
 *
 * No permalink available -- no Permalink field on this model at all, a
 * Permalink field with no Root/Template Page set yet, or this specific
 * record has no slug of its own yet -- is never an error: $content
 * (this block's own already-rendered inner blocks) is printed
 * completely unwrapped, exactly as if this block weren't there at all.
 * A card that can't be made clickable should still show its own text/
 * image/etc., not disappear.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none -- see this block's own docblock).
 * @var string   $content    Already-rendered InnerBlocks output.
 * @var WP_Block $block      Block instance, with context from its ancestor Data Cards/Data Display/Single Record block.
 */

defined( 'ABSPATH' ) || exit;

if ( '' === $content ) {
	// Nothing to wrap at all -- an empty card-link block with no inner
	// blocks authored yet. Printing an empty <a></a> would be pointless
	// either way, so this returns before ever bothering to look up a
	// permalink for it.
	return;
}

$record = $block->context['record'] ?? null;

$url = \Gateway\Permalink_Routes::url_for_record( $record );

if ( ! $url ) {
	echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output.
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'href' => esc_url( $url ) ) );
?>
<a <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></a>
