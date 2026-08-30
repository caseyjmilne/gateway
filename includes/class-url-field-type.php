<?php
/**
 * The "URL" field type -- a single-line string stored exactly like
 * Text_Field_Type's own value (Schema Blueprint's `string()`), rendered
 * as `<input type="url">` so the browser offers its own basic format
 * hinting/keyboard on mobile. Same "no validation in cast()" trade-off
 * as Email_Field_Type -- see that class's own docblock.
 *
 * Unlike Email_Field_Type, this recognizes a Default Value and a
 * Placeholder ONLY -- no Prepend/Append: a "$" or "USD" flanking a URL
 * reads as nonsense in a way it doesn't for an email address, so those
 * two are deliberately left out of the presentation catalog here rather
 * than offered and just never making sense in practice.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class URL_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'url';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'URL', 'gateway' );
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
		return 'url';
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
	 * `instructions` plus a Placeholder (e.g. "https://example.com") --
	 * NOT `prepend`/`append`, unlike Text/Number/Range/Email -- see this
	 * class's own docblock for why.
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'placeholder' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default URL makes just as much sense here as it does for a plain
	 * Text field -- e.g. pre-filling a "Website" field with the site
	 * owner's own domain.
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
}
