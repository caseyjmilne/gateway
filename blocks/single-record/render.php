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
 * matched. get_query_var('gateway_model') is what Permalink_Routes'
 * own rewrite rule actually resolved this specific request to -- the
 * one source of truth for "which model is this page really serving right
 * now," independent of whatever this block was last configured for.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: collection, sourceType (fixed 'collection', block-context-only),
 *                            previewRecordId (editor-preview-only -- see edit.js's own docblock; never read here).
 * @var string   $content    Already-rendered InnerBlocks output -- see above.
 * @var WP_Block $block      Block instance (unused -- no context read here).
 */

defined( 'ABSPATH' ) || exit;

$collection = isset( $attributes['collection'] ) && is_string( $attributes['collection'] )
	? trim( $attributes['collection'] )
	: '';

if ( '' === $collection || $collection !== (string) get_query_var( 'gateway_model' ) ) {
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-single-record' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></div>
