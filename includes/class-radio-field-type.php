<?php
/**
 * The "Radio" field type -- a single choice from the field's own
 * configured list (Model_Field_Choices), rendered as a native group of
 * `<input type="radio">` options, all sharing the field's own name.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Radio_Field_Type implements Choice_Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'radio';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Radio', 'gateway' );
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
		return 'radio';
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
	 */
	public static function is_multiple() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function presentation_fields() {
		return array();
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
}
