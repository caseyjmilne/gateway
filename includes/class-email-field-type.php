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
 * Presentation/General settings mirror Text_Field_Type's own exactly --
 * a Default Value, and a Placeholder/Prepend/Append trio under
 * Presentation -- there's nothing about being an email address
 * specifically that changes any of that.
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
	public static function category() {
		return 'Basic';
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
	 * The same set Text_Field_Type recognizes -- a placeholder (e.g.
	 * "you@example.com") and a prepended/appended string are exactly as
	 * meaningful for an email address as they are for any other
	 * single-line string.
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'placeholder', 'prepend', 'append' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default address makes just as much sense here as it does for a
	 * plain Text field -- e.g. pre-filling a support contact form's
	 * "Reply to" with the site owner's own address.
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
