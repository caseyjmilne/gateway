<?php
/**
 * Server-side render for the gateway/card-field-email block.
 *
 * Structurally gateway/card-field-text's own close sibling -- same
 * synthetic-per-record-wrapper caveat (see that block's own render.php
 * docblock for the full "why `usesContext`'s
 * 'gateway/data-cards/sourceType'`/`'gateway/data-cards/collection'` never
 * actually reach here on the front end" reasoning, verbatim here too),
 * same "read `record` from context, derive the collection via
 * `get_class()`, never trust the editor's own picker alone" discipline.
 *
 * The one real difference: this block's own Field picker (edit.js) is
 * filtered to `isEmailRenderable` (`Field_Type::is_email_renderable()`,
 * true only for `Email_Field_Type` today -- see that interface method's
 * own docblock for why this is a SEPARATE, additive flag rather than
 * folded into `isTextRenderable`, which an Email field already answers
 * `true` to as well), and this adds one thing `gateway/card-field-text`
 * has no reason to: an optional `mailto:` link, off by default per a
 * direct request ("by default this is turned off and only text is
 * displayed").
 *
 * When `useMailtoLink` IS on, both the visible text and the `href`
 * itself are ALSO run through WordPress core's own `antispambot()` --
 * the same obfuscation core applies to e.g. a comment author's own
 * email link -- which turns each character into either itself, a
 * numeric HTML entity, or (for the href) a percent-escape, so it still
 * renders and works exactly as a normal `mailto:` link in every real
 * browser, while defeating simple plain-text scrapers that don't
 * execute markup. There would be nothing to gain from doing this for
 * the OFF case (a plain, unlinked address is exactly as visible either
 * way), so it's only ever applied here, alongside the link itself.
 *
 * Escaping still comes FIRST, `antispambot()` only ever runs on the
 * ALREADY-`esc_attr()`/`esc_html()`'d string, never the other way
 * around: `Email_Field_Type::cast()` performs no format validation of
 * its own (see that class's own docblock), so this field's raw stored
 * value can't be assumed to already be a well-formed, markup-free
 * address the way `antispambot()` itself simply assumes its input is.
 * `antispambot()`'s own per-character passthrough branch can and does
 * leave arbitrary bytes of its input completely unmodified -- calling
 * it on a still-raw, un-escaped value would let a `"`/`<`/`>` slip
 * straight through into real markup. Escaping first removes every one
 * of those before `antispambot()` ever sees them, and its own
 * transforms afterward -- entity-encode, percent-encode, or leave a
 * (by then already-safe) character as-is -- can never turn safe text
 * back into something unsafe, so the result is printed as-is with no
 * further escaping (a second escaping pass would double-encode the
 * `&#…;`/`%XX` sequences `antispambot()` itself just produced, breaking
 * the very obfuscation/link this is for).
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey, useMailtoLink.
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
// own available Email fields -- the same "never trust the editor's own
// picker alone" discipline every other render.php in this plugin already
// applies to its own fieldKey attribute (a stale fieldKey, or one whose
// type has since changed away from Email, must never surface whatever
// attribute happens to share its name on the record instead).
$columns_by_key = array();

foreach ( \Gateway\Column_Registry::get_columns_for_collection( $collection ) as $column ) {
	$columns_by_key[ $column['key'] ] = $column;
}

$column = $columns_by_key[ $field_key ] ?? null;

if ( ! $column || empty( $column['isEmailRenderable'] ) ) {
	return;
}

// A plain field ("email") or a related field ("author.email" -- see
// Column_Registry::get_related_columns_for_collection()) resolve the
// same way here: whichever relationship a related field needs was
// already eager-loaded by Data_Cards_Renderer::get_collection_page()
// before $record ever reached this block, so this never lazy-loads one
// on its own.
$value = (string) \Gateway\Column_Registry::resolve_collection_value( $record, $field_key );

if ( '' === trim( $value ) ) {
	return;
}

$use_mailto_link = ! empty( $attributes['useMailtoLink'] );

// `display: inline-block` -- see gateway/card-field-text's own render.php
// docblock for why a plain `<span>`'s own browser-default `inline` would
// otherwise silently swallow this block's own Margin/Padding support.
$wrapper_attributes = get_block_wrapper_attributes( array(
	'class'          => 'gateway-card-field-email',
	'style'          => 'display:inline-block;',
	// Purely descriptive metadata -- same "make rendered output
	// self-describing" convention gateway/card-field-text's own wrapper
	// already carries (see that block's own render.php docblock) -- lets
	// a sibling block elsewhere in the same template scope itself to
	// this field's own rendered content too.
	'data-field-key' => $field_key,
) );
?>
<span <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php
if ( $use_mailto_link ) {
	// Escape FIRST (see this file's own docblock for why), antispambot()
	// only on the result -- its own per-character output (itself,
	// `&#NN;`, or, in `$mailto = 1` mode, `%XX`) is already safe to
	// print as-is, and printing it through esc_attr()/esc_html() a
	// second time would double-encode those sequences and break the
	// obfuscation. `$mailto = 1` for the href only -- it's what actually
	// allows antispambot()'s own percent-encode transform, appropriate
	// inside a URI but not for the visible TEXT (which stays in the
	// default, never-percent-encoded mode so it still reads as a normal
	// address rather than stray "%40"-style noise).
	$safe_href = esc_attr( 'mailto:' . $value );
	$safe_text = esc_html( $value );
	printf(
		'<a href="%s">%s</a>',
		antispambot( $safe_href, 1 ), // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already esc_attr()'d above; antispambot()'s own output is safe to print as-is, see this file's own docblock.
		antispambot( $safe_text ) // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already esc_html()'d above; antispambot()'s own output is safe to print as-is, see this file's own docblock.
	);
} else {
	echo esc_html( $value );
}
?></span>
