<?php
/**
 * Server-side render for the gateway/card-field-image block.
 *
 * Structurally the same "synthetic wrapper block" context-reading
 * caveats as gateway/card-field-text/gateway/card-field-number's own
 * render.php files -- see gateway/card-field-text/render.php's own
 * docblock for the full reasoning this shares verbatim (deliberately
 * doesn't read 'gateway/data-cards/sourceType'/'gateway/data-cards/collection'
 * from context here, only the editor's own edit.js does). The real
 * difference: eligibility is `Column_Registry`'s own `isImage` (backed by
 * `Field_Type::supports_media_settings()`, true only for Image_Field_Type)
 * instead of `isTextRenderable`/`isNumeric`, and the resolved value --
 * always a bare, raw attachment id straight off the record, regardless
 * of the field's own configured Return Format (that setting only ever
 * shapes what a REST *consumer* sees, never what's actually stored) --
 * is handed to `Image_Renderer::render()`, which is what actually
 * detects the format and applies the right resolution: 'array'/'id' both
 * resolve any registered size via a real `wp_get_attachment_image()`
 * call; 'url' is a flat string with no id to look a different size up
 * from, so it always renders full-size regardless of this block's own
 * `size` attribute.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey, size.
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
// own available IMAGE columns -- a stale fieldKey (the model's fields
// changed since this block was configured, or the field's own type
// changed away from Image) must never surface whatever attribute happens
// to share its name on the record instead. Building the full key => column
// map (rather than just filtering to a flat list of keys, the way
// gateway/card-field-text/-number's own render.php do) since this block
// also needs the eligible column's own `returnFormat` right after, not
// just whether `$field_key` is one of them.
$columns_by_key = array();

foreach ( \Gateway\Column_Registry::get_columns_for_collection( $collection ) as $column ) {
	$columns_by_key[ $column['key'] ] = $column;
}

if ( empty( $columns_by_key[ $field_key ]['isImage'] ) ) {
	return;
}

$return_format = $columns_by_key[ $field_key ]['returnFormat'];

// A plain field ("photo") or a related field ("vendor.logo" -- see
// Column_Registry::get_related_columns_for_collection()) resolve the
// same way here; whichever relationship a related field needs was
// already eager-loaded by Data_Cards_Renderer::get_collection_page()
// before $record ever reached this block, so this never lazy-loads one
// on its own -- identical to gateway/card-field-text's own reasoning.
// Always the raw, real attachment id, regardless of $return_format --
// Image_Renderer::render() is what actually branches on that.
$attachment_id = \Gateway\Column_Registry::resolve_collection_value( $record, $field_key );

$size = isset( $attributes['size'] ) && is_string( $attributes['size'] ) && '' !== $attributes['size']
	? $attributes['size']
	: 'full';

$image_html = \Gateway\Image_Renderer::render( $attachment_id, $return_format, $size );

if ( '' === $image_html ) {
	// Nothing to show -- the field was never filled in on this record,
	// or its own attachment has since been deleted. Render nothing at
	// all rather than a broken-image icon.
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-field-image' ) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $image_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped by Image_Renderer::render(). ?></span>
