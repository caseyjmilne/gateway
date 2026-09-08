<?php
/**
 * The "Time" field type -- copies ACF's own Time Picker field, per a
 * direct request: "we need a time picker field type, similar to ACF."
 * `Date_Field_Type`'s own close sibling, same reasoning throughout --
 * see that class's own docblock for the fuller version of every point
 * below.
 *
 * Stored as a real `TIME` column (Schema Blueprint's `time()`), a
 * canonical `"H:i:s"` string -- `cast()` normalizes whatever it's handed
 * down to that same three-part shape (defaulting a bare "H:i" input's
 * missing seconds to `:00`, the same way MySQL's own `TIME` column would
 * itself). `eloquent_cast()` stays `null`, same reasoning as Date's own:
 * a record's GET response always hands back that exact plain string,
 * never some richer time-object wrapper.
 *
 * `input_type()` is a REAL, native HTML `<input type="time">` -- exactly
 * `Date_Field_Type`'s own "no bespoke JS component needed" reasoning,
 * satisfying "provide user with [a] time picker" entirely via the
 * browser's own built-in one. There's one genuine wrinkle a plain
 * `<input type="time">` (no `step="1"`) only ever edits down to MINUTE
 * granularity -- its own value is always exactly `"HH:mm"`, never
 * `"HH:mm:ss"` -- while this type's own canonical stored shape carries
 * seconds. `RecordForm` is what bridges that gap (see its own
 * `initialValues` branch for this type): an existing record's own full
 * `"H:i:s"` value is truncated down to `"H:i"` before ever being handed
 * to the control as its own `value`, and whatever bare `"H:i"` the
 * control reports back on submit is sent as-is -- `cast()` here is what
 * pads it back out to a real `"H:i:s"` on the way into storage, the
 * same "defensive normalization, not a strict parser" reasoning
 * `Date_Field_Type::cast()` already documents for its own value.
 *
 * `supports_default_value()` is `true`, but -- unlike `Date_Field_Type`'s
 * own request-specific `'today'` sentinel -- this is the SAME plain
 * literal-value shape Text/Number/Email/URL already have: a real fixed
 * time typed (or picked) once at field-configuration time, not a "right
 * now" sentinel resolved fresh per new record. No such "current time"
 * option was asked for here the way "today" explicitly was for Date, so
 * none is invented -- `FieldEditor.jsx`'s own General tab renders a
 * plain `<input type="time">` for it (mirroring the plain
 * `<input type="number">` it already renders for `Number_Field_Type`),
 * and `Model_Fields::sanitize_settings()` needs no special-casing at all
 * for it, the same "generic string sanitizing already does the right
 * thing" reasoning `True_False_Field_Type`'s own boolean default already
 * gets.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Time_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'time';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Time', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * `Advanced` -- the same category `Permalink_Field_Type`/
	 * `Date_Field_Type` already call home.
	 */
	public static function category() {
		return 'Advanced';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'time';
	}

	/**
	 * @inheritDoc
	 *
	 * A genuine, native `<input type="time">` -- see this class's own
	 * docblock for why that alone is what makes "provide user with a
	 * time picker" true, and for the one small seconds-granularity
	 * wrinkle `RecordForm` handles on top of it.
	 */
	public static function input_type() {
		return 'time';
	}

	/**
	 * @inheritDoc
	 *
	 * Defensive normalization, not a strict parser -- the exact same
	 * reasoning `Date_Field_Type::cast()` already gives for its own
	 * value, just reduced to `"H:i:s"` instead of `"Y-m-d"`. A bare
	 * `"14:30"` (what `RecordForm`'s own plain `<input type="time">`
	 * actually sends) normalizes to `"14:30:00"` -- `strtotime()` already
	 * resolves a bare time string against today's own date for exactly
	 * this purpose, its date component simply discarded here since only
	 * the time-of-day ever matters for this type. Genuinely unparsable
	 * input is dropped to `null`, same as `Date_Field_Type`'s own.
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		$timestamp = strtotime( (string) $value );

		return false === $timestamp ? null : gmdate( 'H:i:s', $timestamp );
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
	public static function is_orderable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * A plain `"H:i:s"` string is safe, meaningful plain text -- the same
	 * reasoning `Date_Field_Type::is_text_renderable()` already gives for
	 * its own plain string value.
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
	public static function is_markdown_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_email_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * Deliberately `null` -- see this class's own docblock, same
	 * "plain string in, plain string back out" reasoning `Date_Field_Type::
	 * eloquent_cast()` already gives.
	 */
	public static function eloquent_cast() {
		return null;
	}

	/**
	 * @inheritDoc
	 *
	 * `instructions` alone -- a native `<input type="time">` already
	 * shows the current locale's own time format as its own built-in
	 * placeholder, the same reasoning `Date_Field_Type::presentation_fields()`
	 * already gives for omitting one of its own.
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * `true` -- a plain literal default (Text/Number's own shape), not a
	 * "right now" sentinel -- see this class's own docblock for why no
	 * such sentinel exists here the way `Date_Field_Type`'s own `'today'`
	 * does.
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
	public static function supports_post_object_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_page_link_settings() {
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
	 *
	 * A time of day isn't a quantity -- the same reasoning
	 * `Date_Field_Type::is_numeric()` already gives for its own value.
	 */
	public static function is_numeric() {
		return false;
	}
}
