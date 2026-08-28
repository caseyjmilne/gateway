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
	public static function presentation_fields() {
		return array();
	}
}
