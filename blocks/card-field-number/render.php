<?php
/**
 * Server-side render for the gateway/card-field-number block.
 *
 * Structurally identical to gateway/card-field-text/render.php -- same
 * context-reading caveats (deliberately doesn't read
 * 'gateway/data-cards/sourceType'/'gateway/data-cards/collection' here,
 * only the editor's own edit.js does; see that file's own docblock for
 * the full "synthetic wrapper block" reasoning this shares verbatim) --
 * with two differences: the eligibility check is `Field_Type::is_numeric()`
 * instead of `is_text_renderable()`, and the resolved value is run
 * through `Number_Formatter::format()` before being printed, using this
 * block's own `numberFormat` attribute.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey, numberFormat.
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
// own available, NUMERIC columns -- a stale fieldKey (the model's fields
// changed since this block was configured, or the field's own type
// changed away from Number/Range) must never surface whatever attribute
// happens to share its name on the record instead, and must never run
// Number_Formatter::format() against a value that was never a real
// number to begin with (a Relate to Many field's own relationship
// object, e.g., which is_numeric() would never be true for anyway, but
// this is the same "never trust the editor's own picker alone"
// discipline every other render.php in this plugin already applies to
// its own fieldKey/relationship attributes -- see gateway/card-field-text's
// own identical check, just against is_numeric() instead of
// is_text_renderable()).
$numeric_keys = wp_list_pluck(
	array_filter(
		\Gateway\Column_Registry::get_columns_for_collection( $collection ),
		function ( $column ) {
			return ! empty( $column['isNumeric'] );
		}
	),
	'key'
);

if ( ! in_array( $field_key, $numeric_keys, true ) ) {
	return;
}

// A plain field ("price") or a related field ("vendor.commission_rate" --
// see Column_Registry::get_related_columns_for_collection()) resolve the
// same way here; whichever relationship a related field needs was
// already eager-loaded by Data_Cards_Renderer::get_collection_page()
// before $record ever reached this block, so this never lazy-loads one
// on its own -- identical to gateway/card-field-text's own reasoning.
$raw_value = \Gateway\Column_Registry::resolve_collection_value( $record, $field_key );

$number_format = \Gateway\Number_Formatter::sanitize_settings( $attributes['numberFormat'] ?? array() );
$value         = \Gateway\Number_Formatter::format( $raw_value, $number_format );

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-field-number' ) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo esc_html( $value ); ?></span>
