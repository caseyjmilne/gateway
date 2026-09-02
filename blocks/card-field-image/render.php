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
 * Also rounds out this block toward `core/image`'s own settings, per a
 * direct request: `align`/`anchor`/Spacing(Margin)/Border/Duotone are
 * plain `block.json` `supports` declarations (see that file's own
 * `__experimentalDefaultControls` -- all `true`, VISIBLE immediately,
 * not hidden behind a "+" toggle the way `card-field-text`'s own first
 * attempt at this shipped with a real, reported bug); Aspect Ratio +
 * Object Fit (`aspectRatio`/`scale`) are two new attributes applied
 * directly to the `<img>` tag itself via `Image_Renderer::render()`'s
 * own `$extra_attrs` (works uniformly across all three Return Formats,
 * unlike Size -- a plain CSS `aspect-ratio`/`object-fit` pair needs
 * nothing about a registered WP image size at all); and Link Settings
 * (`linkDestination`/`linkTarget`/`href`) wrap the already-rendered
 * `<img>` in a real `<a>` -- "Media File"/"Attachment Page" both
 * resolve off the SAME raw attachment id this file already reads
 * regardless of Return Format, so (unlike Size, again) linking works
 * identically for a 'url'-format field too, not just 'array'/'id'.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey, size, aspectRatio, scale, linkDestination, linkTarget, href.
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

// Aspect Ratio + Object Fit -- applied straight onto the <img> tag
// itself via $extra_attrs, exactly like core/image's own pair (a plain
// CSS aspect-ratio/object-fit combination, nothing tied to WP's own
// registered-size system the way Size above is) -- works identically
// regardless of Return Format, unlike Size, which 'url' can't support
// at all (see this file's own docblock). An empty aspectRatio (the
// "Original" choice -- the default, and the only sane one for a field
// that's never had this configured at all) means no override: the
// image keeps rendering at its own natural proportions, same as before
// this feature existed.
$aspect_ratio = isset( $attributes['aspectRatio'] ) && is_string( $attributes['aspectRatio'] ) ? trim( $attributes['aspectRatio'] ) : '';
$scale        = isset( $attributes['scale'] ) && is_string( $attributes['scale'] ) && '' !== $attributes['scale']
	? $attributes['scale']
	: 'cover';

$extra_attrs = array();

if ( '' !== $aspect_ratio ) {
	$extra_attrs['style'] = sprintf(
		'aspect-ratio:%s;object-fit:%s;width:100%%;height:100%%;',
		esc_attr( $aspect_ratio ),
		esc_attr( $scale )
	);
}

$image_html = \Gateway\Image_Renderer::render( $attachment_id, $return_format, $size, $extra_attrs );

if ( '' === $image_html ) {
	// Nothing to show -- the field was never filled in on this record,
	// or its own attachment has since been deleted. Render nothing at
	// all rather than a broken-image icon.
	return;
}

// Link Settings -- wraps the already-rendered <img> in a real <a>,
// exactly like core/image's own "Link to" setting. "Media File" and
// "Attachment Page" both resolve off $attachment_id directly (already
// confirmed to genuinely exist -- Image_Renderer::render() only ever
// returns non-empty markup for a real, still-existing attachment), so
// -- unlike Size -- this works identically for a 'url'-format field
// too, which has no id of its OWN to offer a REST consumer, but still
// has a perfectly real one underneath for this purpose.
$link_destination = isset( $attributes['linkDestination'] ) && is_string( $attributes['linkDestination'] )
	? $attributes['linkDestination']
	: 'none';

$href = \Gateway\Image_Renderer::resolve_link_href(
	(int) $attachment_id,
	$link_destination,
	isset( $attributes['href'] ) && is_string( $attributes['href'] ) ? $attributes['href'] : ''
);

if ( $href ) {
	$link_target = isset( $attributes['linkTarget'] ) && '_blank' === $attributes['linkTarget'] ? '_blank' : '';

	$image_html = sprintf(
		'<a href="%s"%s>%s</a>',
		esc_url( $href ),
		$link_target ? ' target="_blank" rel="noreferrer noopener"' : '',
		$image_html // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped by Image_Renderer::render().
	);
}

// `display: inline-block` + `overflow: hidden` -- the first for the
// same "a plain <span> silently ignores vertical margin" reason
// gateway/card-field-text/render.php's own docblock gives for the
// identical fix (see that file for the full reasoning); the second is
// what actually makes the new Border support's own "radius" do
// anything visible at all -- without it, a rounded WRAPPER still lets
// the image's own square corners poke out past the rounded edge.
// Deliberately not paired with a Shadow support: a shadow needs
// overflow VISIBLE to render outside the element's own box, the exact
// opposite of what radius-clipping needs here -- core/image itself
// avoids this same conflict by applying border/shadow to two DIFFERENT
// selectors (the image directly, and its own placeholder), which isn't
// worth replicating for one style option this block doesn't offer.
//
// The actual `<img>` itself also gets `max-width: 100%; height: auto;`
// -- see this block's own src/style.scss -- so an oversized image can
// never overflow its own grid column and visually overlap a neighboring
// card, reported directly against gateway/data-cards-body's own CSS
// Grid layout.
$wrapper_attributes = get_block_wrapper_attributes( array(
	'class' => 'gateway-card-field-image',
	'style' => 'display:inline-block;overflow:hidden;',
) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $image_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-escaped by Image_Renderer::render() (and, when linked, this file's own esc_url()/hardcoded markup above). ?></span>
