<?php
/**
 * The "Text" field type -- a single-line string, rendered as a plain
 * text input.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Text_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'text';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Text', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'string';
	}

	/**
	 * @inheritDoc
	 */
	public static function input_type() {
		return 'text';
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
	public static function is_text_renderable() {
		return true;
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
	 * `instructions` is recognized by every built-in type (see this
	 * interface method's own docblock); `placeholder`/`prepend`/`append`
	 * are Text/Number/Range-specific -- see the whole "different types
	 * need different presentation data" design this is the first real
	 * use of.
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'placeholder', 'prepend', 'append' );
	}

	/**
	 * @inheritDoc
	 *
	 * One of the two types (alongside Number_Field_Type) a configurable
	 * default value actually makes sense for -- see this interface
	 * method's own docblock.
	 */
	public static function supports_default_value() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * One of the two types (alongside Text_Area_Field_Type) a character
	 * limit actually makes sense for -- see this interface method's own
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
}
