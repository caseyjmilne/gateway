<?php
/**
 * Server-side render for the gateway/single-record block.
 *
 * Unlike gateway/related-items/gateway/card-field-text, this never reads
 * `$block->context['record']` at all -- there's nothing to loop over, so
 * there's no per-item WP_Block/render_block_context dance needed here.
 * `Permalink_Routes::inject_record_context()` already put `'record'`
 * (and `gateway/data-cards/sourceType`/`collection`) into block context
 * for the ENTIRE page, before WordPress ever started rendering this
 * block's own InnerBlocks -- so $content, computed by the normal
 * WP_Block::render() flow before this callback ever runs, already IS
 * this template's fully rendered output, with every nested
 * gateway/card-field-text and gateway/related-items already reading the
 * real record.
 *
 * This block carries no attributes of its own at all -- unlike the
 * earlier design, "which Collection is this Template for" now lives on
 * the Template post itself (a `gateway_templates` post's own
 * `Template_Post_Type::META_COLLECTION` meta, edited via the "Gateway
 * Template" sidebar panel -- see `src/template-panel.js`), not on this
 * block. `Permalink_Routes` already guarantees `$context['record']` is
 * only ever populated when the resolved model genuinely matches the
 * Template post currently being viewed (`resolve_record()`/
 * `resolve_preview_record()` both derive the model from that SAME meta
 * key), so there's nothing left for this callback to re-validate --
 * it's a plain, unconditional passthrough, the same shape most other
 * dynamic InnerBlocks wrappers in this plugin already use.
 *
 * @package Gateway
 *
 * @var string $content Already-rendered InnerBlocks output -- see above.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-single-record' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped InnerBlocks output. ?></div>
