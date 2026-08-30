<?php
/**
 * The "Number" field type -- rendered as a plain number input, stored as
 * a real number (not a numeric-looking string) via a stored column type
 * that accepts both integers and decimals (Model_Fields maps this type
 * to Schema Blueprint's `double()`).
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Number_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'number';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Number', 'gateway' );
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
		return 'double';
	}

	/**
	 * @inheritDoc
	 */
	public static function input_type() {
		return 'number';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		// `+ 0` coerces a numeric string (or an already-numeric value) to
		// an int or float, whichever the value itself actually is --
		// simpler than picking one of (int)/(float) upfront and getting
		// it wrong for the other case.
		return is_numeric( $value ) ? $value + 0 : null;
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
	 * `placeholder`/`prepend`/`append`, alongside Text_Field_Type/
	 * Range_Field_Type -- plus `step`, shared only with Range_Field_Type,
	 * recognized by no other type (see this interface method's own
	 * docblock for why the fixed catalog can grow a key like this one
	 * without every other type needing to care).
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'placeholder', 'step', 'prepend', 'append' );
	}

	/**
	 * @inheritDoc
	 *
	 * One of the two types (alongside Text_Field_Type) a configurable
	 * default value actually makes sense for -- see this interface
	 * method's own docblock.
	 */
	public static function supports_default_value() {
		return true;
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
}
