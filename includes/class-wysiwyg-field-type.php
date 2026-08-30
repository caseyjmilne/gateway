<?php
/**
 * The "WYSIWYG Editor" field type -- Text_Area_Field_Type's own rich
 * sibling: same underlying storage (a real TEXT column, Schema
 * Blueprint's `text()`, no arbitrary length cap), same plain-string
 * cast, but edited through the real WordPress classic editor
 * (`window.wp.editor.initialize()`, the exact `tinymce`/`quicktags` pair
 * a post's own content editor and ACF's own WYSIWYG field both use)
 * instead of a plain `<textarea>`. The stored value is genuine HTML
 * markup, not plain text -- what actually distinguishes this from
 * Text_Area_Field_Type, not the column type or the cast.
 *
 * `is_text_renderable()` is `false`, unlike Text_Area's own `true`:
 * Column_Registry's own "render this field's value as plain text"
 * concept (Data Table/Data Cards columns, currently the only consumer)
 * assumes a value safe to print as-is -- true for Text_Area's own plain
 * string, not for this type's own HTML, which would either show raw
 * `<p>` tags as literal text (escaped) or need a whole separate
 * "render as trusted HTML" story this field type doesn't have yet.
 * Nothing asked for that story; leaving this `false` keeps the gap
 * explicit rather than silently doing the wrong thing either way.
 *
 * `is_filterable()` stays `true` -- a "contains" search still means
 * something against the raw markup (the same way WordPress's own
 * `post_content` search already works against raw HTML), even without
 * a rendering story.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class WYSIWYG_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'wysiwyg';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'WYSIWYG Editor', 'gateway' );
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
	 * Not a real HTML `<input>` type (there's no `<input type="wysiwyg">`,
	 * same "signal, not a literal attribute" convention as
	 * Text_Area_Field_Type's own `'textarea'`) -- RecordForm renders this
	 * as a `WysiwygEditor` (a real TinyMCE/quicktags instance) instead of
	 * a plain `<textarea>`.
	 */
	public static function input_type() {
		return 'wysiwyg';
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
	 *
	 * See this class's own docblock -- the stored value is HTML, not
	 * plain text, and there's no "render as trusted HTML" story yet for
	 * Column_Registry's own consumers to fall back on.
	 */
	public static function is_text_renderable() {
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
	 * Unlike ACF's own WYSIWYG field (which does offer a default HTML
	 * value), this stays `false` for now -- General's own Default Value
	 * input is a plain single-line `<input>` (see RecordForm.jsx's own
	 * docblock), never itself a rich editor, which would make typing a
	 * meaningful HTML default awkward at best. Nothing asked for this
	 * yet; revisit if it is.
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
}
