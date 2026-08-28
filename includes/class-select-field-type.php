<?php
/**
 * The "Select" field type -- a single choice from the field's own
 * configured list (Model_Field_Choices), rendered as a native `<select>`
 * dropdown.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Select_Field_Type implements Choice_Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'select';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Select', 'gateway' );
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
		return 'select';
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
}
