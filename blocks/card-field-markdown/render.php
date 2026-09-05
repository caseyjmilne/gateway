<?php
/**
 * Server-side render for the gateway/card-field-markdown block.
 *
 * `gateway/card-field-text`'s own close sibling -- same context (a
 * synthetic per-record wrapper tree; see that block's own render.php
 * docblock for the full "why" this deliberately never reads
 * 'gateway/data-cards/sourceType'/'gateway/data-cards/collection' from
 * `$block->context` on the front end, only `record`), same re-validation
 * discipline (a stale/hand-crafted `fieldKey` must never reach a raw
 * attribute read), same Field picker shape -- but for exactly ONE kind
 * of field, `Markdown_Field_Type`'s own (`isMarkdownRenderable`, not
 * `isTextRenderable`/`isHtmlRenderable`): a Markdown field's own raw
 * stored value is neither safe to print as plain text (full of literal
 * `#`/`**`/`` ` `` syntax) nor already HTML the way WYSIWYG's own is --
 * it needs a REAL conversion step, which is this block's entire reason
 * to exist as its own, separate block rather than one more branch
 * inside `gateway/card-field-text` itself. `Markdown_Converter::convert_to_html()`
 * (a safe, non-default `league/commonmark` configuration -- see that
 * class's own docblock) is what actually does the conversion; this file
 * only ever calls it once, straight into the wrapper.
 *
 * A `<div>` wrapper, not `gateway/card-field-text`'s own inline
 * `<span>`: converted Markdown is genuinely block-level content
 * (paragraphs, headings, lists, code blocks), not a single inline run
 * of text meant to sit next to other content on the same line.
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
// own available, Markdown-renderable columns -- a stale fieldKey (the
// model's fields changed since this block was configured, or the
// field's own type changed away from Markdown) must never surface
// whatever attribute happens to share its name on the record instead,
// and must never run a non-Markdown value (a Password's secret, a
// Relate field's own id/relationship) through the Markdown converter at
// all. The editor's own Field picker (edit.js) already only ever offers
// an eligible field, but this is what actually enforces it -- the same
// "never trust the editor's own picker alone" reasoning
// gateway/card-field-text's own render.php already applies to its
// identically-shaped fieldKey attribute.
$columns_by_key = array();

foreach ( \Gateway\Column_Registry::get_columns_for_collection( $collection ) as $column ) {
	$columns_by_key[ $column['key'] ] = $column;
}

$column = $columns_by_key[ $field_key ] ?? null;

if ( ! $column || empty( $column['isMarkdownRenderable'] ) ) {
	return;
}

// A plain field ("body") or a related field ("event.description" -- see
// Column_Registry::get_related_columns_for_collection()) resolve the
// same way here: whichever relationship a related field needs was
// already eager-loaded before $record ever reached this block, so this
// never lazy-loads one on its own -- same reasoning
// gateway/card-field-text's own identical resolve_collection_value()
// call already documents.
$value = \Gateway\Column_Registry::resolve_collection_value( $record, $field_key );

$html = \Gateway\Markdown_Converter::convert_to_html( (string) ( $value ?? '' ) );

if ( '' === $html ) {
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array(
	'class'          => 'gateway-card-field-markdown',
	// Same purely-descriptive metadata gateway/card-field-text's own
	// wrapper now carries -- lets gateway/data-display-toc's own
	// optional "only parse these fields" setting scope itself to this
	// field's own rendered content (see that block's own view.js).
	'data-field-key' => $field_key,
) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php
// Trusted, real HTML -- Markdown_Converter's own safe configuration
// already escapes any raw HTML embedded in the Markdown source itself
// (see that class's own docblock), so what it returns is safe to print
// verbatim, the same trust `gateway/card-field-text`'s own WYSIWYG
// branch already extends to CommonMark's real output here.
echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markdown_Converter's own safe config, see comment above.
?></div>
