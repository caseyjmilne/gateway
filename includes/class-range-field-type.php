<?php
/**
 * The "Range" field type -- a numeric value picked via an HTML5 slider
 * (`<input type="range">`), stored the same way Number_Field_Type's own
 * value is (Schema Blueprint's `double()`, accepting both integers and
 * decimals) since a slider's value is still just a number underneath.
 *
 * Renders with the browser's own default min/max/step (0-100, step 1) --
 * there's no per-field way to configure those yet, since that would mean
 * a field-level settings concept beyond {name, label, type} this class
 * alone can't add on its own. A future version could surface min/max/
 * step as part of the Field Editor once such a concept exists.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Range_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'range';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Range', 'gateway' );
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
		return 'range';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		// Same coercion as Number_Field_Type::cast() -- a slider's value
		// is still just a number, int or float depending on what it
		// actually is.
		return is_numeric( $value ) ? $value + 0 : null;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_sensitive() {
		return false;
	}
}
