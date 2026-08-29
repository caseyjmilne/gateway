<?php
/**
 * The "True/False" field type -- a plain boolean, rendered as a single
 * `<input type="checkbox">` (checked = true). Unlike Buttons/Select/
 * Radio/Checkbox, this is NOT a Choice_Field_Type -- there's no
 * site-owner-configured list of options at all, just a fixed on/off
 * value, so it implements the plain Field_Type contract directly.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class True_False_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'true_false';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'True/False', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'boolean';
	}

	/**
	 * @inheritDoc
	 */
	public static function input_type() {
		return 'boolean';
	}

	/**
	 * Accepts a real bool (the normal case, RecordForm.jsx's own checkbox
	 * state serialized straight into the JSON request body), or, for a
	 * plainer REST client, any of the common truthy string/number spellings
	 * -- "1"/"0", "true"/"false", "yes"/"no", "on"/"off" -- rather than
	 * PHP's own loose (bool) cast, which would make the literal string
	 * "false" cast to `true` (a non-empty string), the exact opposite of
	 * what a caller typing that string almost certainly means.
	 *
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( is_bool( $value ) ) {
			return $value;
		}

		if ( null === $value ) {
			return false;
		}

		if ( is_string( $value ) ) {
			return in_array( strtolower( trim( $value ) ), array( '1', 'true', 'yes', 'on' ), true );
		}

		return (bool) $value;
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
	 * gateway/card-field-text prints `(string) $value` -- PHP casts a
	 * boolean to "1" (true) or "" (an empty string, false), and an empty
	 * string reads as "this field is unset", not "this is off". A
	 * dedicated block that prints an actual "Yes"/"No" (or similar) is
	 * real, separate, undone work.
	 */
	public static function is_text_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return 'boolean';
	}

	/**
	 * @inheritDoc
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
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
}
