<?php
/**
 * Server-side render for the gateway/card-field-text block.
 *
 * Deliberately does NOT read 'gateway/data-cards/sourceType' or
 * 'gateway/data-cards/collection' from context here, even though both are
 * declared in usesContext (the editor's own edit.js does read them, for
 * its field picker) -- on the front end this block is a descendant of a
 * *synthetic* wrapper block Data_Cards_Renderer::render_items_for_collection()
 * constructs fresh (`new WP_Block( $wrapper_block )`, with no
 * $available_context argument) once per card, entirely outside the real
 * gateway/data-cards -> ... -> gateway/data-cards-body block tree. That
 * synthetic tree never inherits the real tree's own providesContext chain
 * -- only whatever a `render_block_context` filter explicitly injects
 * while it renders (exactly how WordPress core's own
 * render_block_core_post_template() works for 'postId'/'postType') reaches
 * it. render_items_for_collection() only ever injects the one thing this
 * block actually needs -- the unnamespaced 'record' key, the real
 * Eloquent model instance for THIS card -- so that's the only context this
 * file can rely on; sourceType/collection would silently read back
 * whatever WP_Block defaults an absent context key to ('postType'/'' here),
 * never the real values, which is exactly what made every card render
 * empty before this was fixed. The model class is instead read directly
 * off the record itself (`get_class( $record )`), which is always correct
 * by construction and needs no context at all.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/data-cards.
 */

defined( 'ABSPATH' ) || exit;

$record = $block->context['record'] ?? null;

$field_key = isset( $attributes['fieldKey'] ) && is_string( $attributes['fieldKey'] ) ? trim( $attributes['fieldKey'] ) : '';

if ( '' === $field_key || ! ( $record instanceof \Illuminate\Database\Eloquent\Model ) ) {
	return;
}

$collection = get_class( $record );

// Only ever trust a field key that's genuinely still one of this model's
// own available columns -- a stale fieldKey (the model's fields changed
// since this block was configured) must never surface whatever attribute
// happens to share its name on the record instead (id, timestamps,
// anything else Eloquent exposes that isn't a real, user-defined field).
$available_keys = wp_list_pluck( \Gateway\Column_Registry::get_columns_for_collection( $collection ), 'key' );

if ( ! in_array( $field_key, $available_keys, true ) ) {
	return;
}

$value = $record->{ $field_key };

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-field-text' ) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo esc_html( (string) $value ); ?></span>
