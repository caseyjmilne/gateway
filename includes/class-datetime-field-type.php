<?php
/**
 * The "Date Time" field type -- copies ACF's own Date Time Picker field,
 * per a direct request: "we need a datetime picker that combines date
 * picker with time picker together, again following how ACF handles
 * this." `Date_Field_Type`/`Time_Field_Type`'s own third sibling, same
 * reasoning throughout -- see those two classes' own docblocks for the
 * fuller version of every point below.
 *
 * Stored as a real `DATETIME` column (Schema Blueprint's `dateTime()`),
 * a canonical `"Y-m-d H:i:s"` string -- the same space-separated shape a
 * `DATETIME` column naturally round-trips, exactly the way `"Y-m-d"`/
 * `"H:i:s"` already do for `DATE`/`TIME`. `eloquent_cast()` stays
 * `null`, same reasoning as both siblings': a record's GET response
 * always hands back that exact plain string, never a `Carbon` instance.
 *
 * `input_type()` is `"datetime-local"` -- a REAL, native HTML5 input
 * type (distinct from this type's own `key()`, `"datetime"` -- what a
 * field's `type` column actually stores) that gives a single combined
 * date-and-time PICKER out of the box, exactly satisfying "a datetime
 * picker that combines date picker with time picker together" with no
 * bespoke JS component needed, the same "let the browser do it" story
 * `Date_Field_Type`/`Time_Field_Type` already tell.
 *
 * Two format gaps to bridge, not just Time's own one -- a native
 * `<input type="datetime-local">` (no `step="1"`) only ever edits down
 * to MINUTE granularity, AND its own value is always `"T"`-separated
 * (`"Y-m-dTH:i"`), never space-separated the way a real `DATETIME`
 * column's own value is. `RecordForm` bridges both at once with one
 * plain string operation (see its own `initialValues` branch for this
 * type): replacing the first space with `"T"` and truncating to 16
 * characters turns `"2026-09-07 14:30:00"` into exactly
 * `"2026-09-07T14:30"` -- and, since a literal Default Value (see
 * `supports_default_value()` below) is ALREADY `"T"`-separated,
 * seconds-free text straight from that same control, the identical
 * operation is a safe no-op for it too, so one branch handles both
 * sources uniformly. Going the other way needs no bridging at all: PHP's
 * own `strtotime()` (what `cast()` below already normalizes through)
 * parses a `"T"`-separated ISO string exactly as readily as a
 * space-separated one, so whatever bare `"Y-m-dTH:i"` the control
 * reports back on submit is sent through completely unconverted --
 * `cast()` is what turns it into this type's own canonical shape on the
 * way into storage.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Datetime_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'datetime';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Date Time', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * `Advanced` -- the same category `Permalink_Field_Type`/
	 * `Date_Field_Type`/`Time_Field_Type` already call home.
	 */
	public static function category() {
		return 'Advanced';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'dateTime';
	}

	/**
	 * @inheritDoc
	 *
	 * `"datetime-local"`, not this type's own `key()` (`"datetime"`) --
	 * see this class's own docblock for why that's the real, native HTML5
	 * type name that gives a single combined date-and-time picker for
	 * free, and for the two format gaps `RecordForm` bridges on top of it.
	 */
	public static function input_type() {
		return 'datetime-local';
	}

	/**
	 * @inheritDoc
	 *
	 * Defensive normalization, not a strict parser -- the exact same
	 * reasoning `Date_Field_Type`/`Time_Field_Type::cast()` already give
	 * for their own values, just combined into `"Y-m-d H:i:s"`.
	 * `strtotime()` already parses a `"T"`-separated ISO string (exactly
	 * what `RecordForm`'s own `<input type="datetime-local">` sends) just
	 * as readily as a space-separated one, so no separate translation
	 * step is needed here at all -- and a bare `"Y-m-dTH:i"` missing
	 * seconds is padded to `:00` the same way `Time_Field_Type::cast()`
	 * already pads its own bare `"H:i"`. Genuinely unparsable input drops
	 * to `null`, same as both siblings' own.
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		$timestamp = strtotime( (string) $value );

		return false === $timestamp ? null : gmdate( 'Y-m-d H:i:s', $timestamp );
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
	 * A plain `"Y-m-d H:i:s"` string is safe, meaningful plain text --
	 * the same reasoning `Date_Field_Type`/`Time_Field_Type::is_text_renderable()`
	 * already give for their own plain string values.
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
	 *
	 * Deliberately `null` -- see this class's own docblock, same "plain
	 * string in, plain string back out" reasoning `Date_Field_Type`/
	 * `Time_Field_Type::eloquent_cast()` already give.
	 */
	public static function eloquent_cast() {
		return null;
	}

	/**
	 * @inheritDoc
	 *
	 * `instructions` alone -- a native `<input type="datetime-local">`
	 * already shows the current locale's own date/time format as its own
	 * built-in placeholder, the same reasoning `Date_Field_Type`/
	 * `Time_Field_Type::presentation_fields()` already give for omitting
	 * one of their own.
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * `true` -- a plain literal default (the SAME shape `Time_Field_Type`'s
	 * own already is, Text/Number's own close cousin), not a "right now"
	 * sentinel -- no such option was asked for this type either, the
	 * same reasoning `Time_Field_Type::supports_default_value()` already
	 * gives for why it doesn't invent one to match `Date_Field_Type`'s
	 * own `'today'`.
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
	 * A calendar date plus a time of day isn't a quantity -- the same
	 * reasoning `Date_Field_Type`/`Time_Field_Type::is_numeric()` already
	 * give for their own values.
	 */
	public static function is_numeric() {
		return false;
	}
}
