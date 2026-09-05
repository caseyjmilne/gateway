<?php
/**
 * The "Text Area" field type -- a multi-line string, rendered as a
 * `<textarea>` (not an `<input>` -- RecordForm special-cases this one
 * input_type() value for exactly that reason) and stored in a real TEXT
 * column (Schema Blueprint's `text()`), unlike Text_Field_Type's own
 * `string()`/VARCHAR -- no arbitrary length cap, appropriate for
 * multi-paragraph content a single-line column would truncate or reject.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Text_Area_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'textarea';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Text Area', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function category() {
		return 'Basic';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'text';
	}

	/**
	 * @inheritDoc
	 */
	public static function input_type() {
		return 'textarea';
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
	 */
	public static function is_text_renderable() {
		return true;
	}

	/**
	 * @inheritDoc
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
	 *
	 * Reported directly: "textarea is missing 3 settings: Rows
	 * Placeholder New Lines... options to automatically add paragraphs
	 * or <br>." `placeholder` is the same shared key/behavior Text/
	 * Number/Email/Password/URL already recognize (a plain `<input>`'s
	 * own `placeholder` attribute -- `RecordForm`'s own `<textarea>`
	 * reads it the identical way). `rows` (`settings.rows`, a positive
	 * whole number -- `Model_Fields::sanitize_settings()`'s own
	 * "positive whole number or dropped" treatment, same as
	 * `character_limit`) sets that same `<textarea>`'s own `rows`
	 * attribute, falling back to the existing fixed default (4) when
	 * blank. `new_lines` (`settings.new_lines`, one of `''`/`'br'`/
	 * `'wpautop'` -- ACF's own three exact values for this same setting)
	 * is the genuinely different one: unlike the other two, it isn't a
	 * `RecordForm` editing concern at all -- editing always shows the
	 * raw, unmodified text exactly as typed -- it controls how
	 * `gateway/card-field-text`'s own render.php displays an ALREADY
	 * -SAVED value on the front end: `''` (the default, preserving this
	 * type's own original behavior for every already-existing field)
	 * leaves the value as plain, escaped text; `'br'`/`'wpautop'` run it
	 * through `nl2br()`/`wpautop()` (after escaping) and print the
	 * result as real, trusted HTML instead, the same way
	 * `WYSIWYG_Field_Type::is_html_renderable()`'s own `true` already
	 * gets that render.php's "print raw, trusted HTML" branch -- see
	 * `Column_Registry::get_columns_for_collection()`'s own `newLines`
	 * key for exactly how a specific FIELD's own setting (not this
	 * TYPE's own static `is_html_renderable()`, which stays `false`)
	 * ends up deciding that per field instance.
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'placeholder', 'rows', 'new_lines' );
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_default_value() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * One of the two types (alongside Text_Field_Type) a character limit
	 * actually makes sense for -- see this interface method's own
	 * docblock.
	 */
	public static function supports_character_limit() {
		return true;
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
}
