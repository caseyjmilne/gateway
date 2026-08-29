<?php
/**
 * The "Range" field type -- a numeric value picked via an HTML5 slider
 * (`<input type="range">`), stored the same way Number_Field_Type's own
 * value is (Schema Blueprint's `double()`, accepting both integers and
 * decimals) since a slider's value is still just a number underneath.
 *
 * `step` (a plain Presentation setting, same as Number's own) and
 * `min_value`/`max_value` (a Validation-tab pair this is the only type
 * that recognizes -- see `supports_range_limits()`) together are what
 * `RecordForm` renders the actual `<input type="range">`'s own
 * `step`/`min`/`max` attributes from; a slider with none of the three
 * configured still falls back to the browser's own bare default
 * (0-100, step 1).
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
	 * Almost the same set Number_Field_Type recognizes -- `step` included,
	 * a slider's own step size is exactly as meaningful here as it is for
	 * a plain number input -- but WITHOUT `placeholder`: a placeholder is
	 * text shown inside an empty `<input>` before a value is typed, which
	 * means nothing for `<input type="range">` (it always has a value,
	 * the slider's current position, and no empty state to hint at).
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'step', 'prepend', 'append' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default position for the slider to start at makes just as much
	 * sense as it does for a plain Number field.
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock.
	 */
	public static function supports_range_limits() {
		return true;
	}
}
