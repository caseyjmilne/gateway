<?php
/**
 * The "Markdown" field type -- stores raw Markdown SOURCE text (a real
 * TEXT column, Schema Blueprint's `text()`, no arbitrary length cap,
 * same underlying storage as Text_Area_Field_Type/WYSIWYG_Field_Type),
 * edited through a real React markdown editor (`@uiw/react-md-editor`,
 * see `MarkdownEditor.jsx`'s own docblock) with a live side-by-side
 * preview, per a direct request ("Use a react markdown editor and
 * enable us to easily make markdown content").
 *
 * Deliberately `is_text_renderable() => false` AND
 * `is_html_renderable() => false` -- unlike WYSIWYG_Field_Type (whose
 * own stored value genuinely IS already trusted HTML, hence `true` for
 * the second flag), this type's own raw stored value is neither safe
 * page-facing plain text (it's full of literal `#`/`**`/`` ` `` markdown
 * syntax, not prose) NOR html at all yet -- it needs a real conversion
 * step first. That's exactly why `is_markdown_renderable()` exists as
 * its own, third content-shape flag (see that interface method's own
 * docblock): `true` only here, `gateway/card-field-text`'s own Field
 * picker (`isTextRenderable || isHtmlRenderable`) never offers a
 * Markdown field at all, which is the whole point -- it forces a real
 * conversion step through the dedicated sibling block this type ships
 * with instead of silently printing raw, unconverted Markdown syntax as
 * if it were finished prose. See `gateway/card-field-markdown`'s own
 * render.php for that conversion (`Markdown_Converter::convert_to_html()`,
 * a safe `league/commonmark` configuration).
 *
 * `is_filterable()` stays `true` -- a "contains" search still means
 * something against the raw Markdown source (the same reasoning
 * WYSIWYG_Field_Type's own docblock already gives for searching its raw
 * HTML), even without a rendering story here either.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Markdown_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'markdown';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Markdown', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function category() {
		return 'Content';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'text';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type (there's no `<input type="markdown">`,
	 * same "signal, not a literal attribute" convention as
	 * Text_Area_Field_Type's own `'textarea'`/WYSIWYG_Field_Type's own
	 * `'wysiwyg'`) -- RecordForm renders this as a `MarkdownEditor`
	 * instead of a plain `<textarea>`.
	 */
	public static function input_type() {
		return 'markdown';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		return null === $value ? null : (string) $value;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_sensitive() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_filterable() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_orderable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * See this class's own docblock -- the raw stored value is Markdown
	 * SOURCE, not safe page-facing prose (full of literal `#`/`**`/
	 * `` ` `` syntax) -- `is_markdown_renderable()` below is the flag
	 * that actually covers displaying it, through a real conversion.
	 */
	public static function is_text_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * See this class's own docblock -- the raw stored value is NOT html
	 * yet, unlike WYSIWYG_Field_Type's own (already-trusted-HTML) value
	 * this flag was written for.
	 */
	public static function is_html_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return null;
	}

	/**
	 * @inheritDoc
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * Same reasoning as WYSIWYG_Field_Type's own: General's own Default
	 * Value input is a plain single-line `<input>` (see RecordForm.jsx's
	 * own docblock), never itself a rich editor, which would make typing
	 * a meaningful Markdown default awkward at best. Nothing asked for
	 * this yet; revisit if it is.
	 */
	public static function supports_default_value() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_character_limit() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_range_limits() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_media_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_file_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_embed_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_user_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_permalink_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_boolean_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_link_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_post_object_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_page_link_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function max_one_per_model() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_numeric() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_markdown_renderable() {
		return true;
	}
}
