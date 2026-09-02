<?php
/**
 * Server-side render for the gateway/single-record block.
 *
 * Unlike gateway/related-items/gateway/card-field-text, this never reads
 * `$block->context['record']` at all -- there's nothing to loop over, so
 * there's no per-item WP_Block/render_block_context dance needed here.
 * `Permalink_Routes::inject_record_context()` already put `'record'` into
 * block context for the ENTIRE page, before WordPress ever started
 * rendering this block's own InnerBlocks -- so $content, computed by the
 * normal WP_Block::render() flow before this callback ever runs, already
 * IS this template's fully rendered output, with every nested
 * gateway/card-field-text and gateway/related-items already reading the
 * real record. This block's own job is narrower: confirm the page being
 * rendered right now actually IS the one its own `collection` attribute
 * was configured for, and pass $content through unchanged.
 *
 * That check matters for the same reason every other block in this
 * plugin re-validates its own attributes against live state rather than
 * trusting the editor's own picker blindly (see e.g. gateway/card-field-text's
 * own fieldKey re-validation): a stale `collection` (the model was
 * retyped/removed, or this same template Page innocently reused for a
 * DIFFERENT model's own Permalinks tab) must never render as if it still
 * matched. `Permalink_Routes::matches_current_request()` (see below) is
 * the one source of truth for "which model is this page really serving
 * right now," independent of whatever this block was last configured
 * for.
 *
 * A direct front-end visit to the Template Page itself (no real
 * `/{root}/{slug}` in the URL at all -- reported directly: "the page is
 * empty [...] populated only in the editor") is handled the same way,
 * one level up: `Permalink_Routes::resolve_preview_record()` reads THIS
 * block's own saved `previewRecordId` straight off the page's own
 * post_content (never from `$attributes` here -- by the time this
 * callback runs, `$content` was already rendered from whatever `record`
 * context that method injected) and falls back to a real record,
 * mirroring edit.js's own preview exactly -- see that method's own
 * docblock. That case never sets `gateway_model` (there's still no real
 * `gateway_slug` in the URL for it to have come from), so the
 * `collection` re-validation below asks `Permalink_Routes::
 * matches_current_request()` rather than comparing against
 * `get_query_var('gateway_model')` directly -- true for either a real
 * resolved request OR this page being $collection's own Template Page.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: collection, sourceType (fixed 'collection', block-context-only),
 *                            previewRecordId (edit.js's own editor preview; also read directly off this
 *                            page's own saved content by Permalink_Routes::find_preview_record_id() for
 *                            the front-end preview fallback -- see that method's own docblock).
 * @var string   $content    Already-rendered InnerBlocks output -- see above.
 * @var WP_Block $block      Block instance (unused -- no context read here).
 */

defined( 'ABSPATH' ) || exit;

$collection = isset( $attributes['collection'] ) && is_string( $attributes['collection'] )
	? trim( $attributes['collection'] )
	: '';

if ( '' === $collection || ! \Gateway\Permalink_Routes::matches_current_request( $collection ) ) {
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-single-record' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></div>
