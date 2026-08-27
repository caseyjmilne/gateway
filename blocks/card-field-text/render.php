<?php
/**
 * Server-side render for the gateway/card-field-text block.
 *
 * Everything this needs about the current card arrives via block context:
 * 'gateway/data-cards/sourceType'/'gateway/data-cards/collection' (the
 * parent gateway/data-cards block's own providesContext, propagating
 * transitively through gateway/data-cards-body the same as any other
 * Gateway context) tell it which model this card template is even for,
 * and the unnamespaced 'record' key (injected per-card by
 * Data_Cards_Renderer::render_items_for_collection() via a
 * render_block_context filter, exactly the same mechanism -- and the
 * same unnamespaced-key convention -- WordPress core itself uses for
 * 'postId'/'postType') is the actual Eloquent model instance for THIS
 * card, shared with every other field-display block in the same card
 * rather than each one re-querying it independently.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/data-cards.
 */

defined( 'ABSPATH' ) || exit;

$source_type = $block->context['gateway/data-cards/sourceType'] ?? 'postType';
$collection  = isset( $block->context['gateway/data-cards/collection'] ) && is_string( $block->context['gateway/data-cards/collection'] )
	? $block->context['gateway/data-cards/collection']
	: '';
$record = $block->context['record'] ?? null;

$field_key = isset( $attributes['fieldKey'] ) && is_string( $attributes['fieldKey'] ) ? trim( $attributes['fieldKey'] ) : '';

if ( 'collection' !== $source_type || '' === $collection || '' === $field_key || ! $record ) {
	return;
}

// Only ever trust a field key that's genuinely still one of this model's
// own available columns -- a stale fieldKey (the model's fields changed
// since this block was configured) must never surface whatever attribute
// happens to share its name on the record instead (id, timestamps,
// anything else Eloquent exposes that isn't a real, user-defined field).
$available_keys = wp_list_pluck( \Gateway\Column_Registry::get_columns_for_collection( $collection ), 'key' );

if ( ! in_array( $field_key, $available_keys, true ) ) {
	return;
}

$value = $record instanceof \Illuminate\Database\Eloquent\Model ? $record->{ $field_key } : '';

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-field-text' ) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo esc_html( (string) $value ); ?></span>
