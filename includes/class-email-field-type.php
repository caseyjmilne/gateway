<?php
/**
 * The "Email" field type -- a single-line string stored exactly like
 * Text_Field_Type's own value (Schema Blueprint's `string()`), rendered
 * as `<input type="email">` so the browser offers its own basic format
 * hinting/keyboard on mobile. cast() applies no format validation of its
 * own (neither does Text_Field_Type) -- an invalid address is still
 * accepted and stored as-is; that's left to a future field-level
 * validation concept, not something a single field type class can add
 * on its own.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Email_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'email';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Email', 'gateway' );
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
		return 'email';
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
}
