<?php
/**
 * The "Date" field type -- copies ACF's own Date Picker field, per a
 * direct request: "we need to add a date picker field, it should work
 * like ACF's. Provide user with date picker. Provide option to set
 * 'today' as the default. Also option to have no date set by default."
 *
 * Stored as a plain `DATE` column (Schema Blueprint's `date()`, no
 * different in kind from a Text field's own `string()`), a canonical
 * `"Y-m-d"` string with no time component -- `cast()` normalizes
 * whatever it's handed down to that same shape (see its own docblock),
 * and `eloquent_cast()` deliberately stays `null` rather than Eloquent's
 * own native `'date'` cast, so a record's own GET response always hands
 * back that exact plain string, never a `Carbon` instance serialized out
 * as a full ISO-8601 timestamp -- simpler, and exactly what `RecordForm`'s
 * own `<input type="date">` (which only ever accepts/emits `"Y-m-d"`
 * strings to begin with) needs on the way back in, with no
 * timezone-shifting conversion required in either direction.
 *
 * `input_type()` is a REAL HTML `<input>` type -- unlike most of this
 * plugin's own non-native `input_type()` values (`"wysiwyg"`/`"markdown"`/
 * `"permalink"`/etc., each a signal `RecordForm` reads to swap in a
 * dedicated component), `"date"` needs no special-cased render branch at
 * all: `RecordForm`'s own generic `<input type={ inputType }>` fallback
 * already renders this as a genuine, native browser date-PICKER --
 * "provide user with date picker" is satisfied entirely by the browser's
 * own built-in calendar widget, the same way `"number"`/`"email"`/`"url"`
 * already get their own native browser affordances for free from that
 * one shared fallback, no bespoke JS date-picker component needed.
 *
 * `supports_default_value()` is `true`, reusing the exact same flag/tab
 * (FieldEditor's own General tab, right where Text/Number/Choice/
 * True-False's own Default Value already lives) `True_False_Field_Type`
 * already demonstrates isn't restricted to one single UI shape -- this is
 * a FOURTH shape again: neither a literal typed value (Text/Number) nor a
 * choices `<select>` (Choice types) nor a boolean switch (True/False), but
 * a small `<select>` offering exactly the two states the request asks
 * for -- "— None —" (no default at all, the blank/unset case every other
 * type already treats identically) or "Today's Date" (`'today'`, a fixed
 * SENTINEL string, not a literal date -- `RecordForm` resolves it to
 * this browser's own actual current date, in ITS OWN local timezone, at
 * the moment a brand new "Add New" form is opened, never a date baked in
 * at save time the way a real default would be for e.g. Number). No
 * third "a specific fixed date" option exists here at all -- unlike ACF's
 * own Date Picker, which does offer one -- because the request enumerates
 * exactly these two states and no others; a future request for a fixed
 * literal default would be a natural addition to this same `<select>`,
 * not a sign this design needs revisiting.
 *
 * `Model_Fields::sanitize_settings()` enforces that sentinel server-side
 * too -- `'today'` is the only value this type's own `settings.default`
 * is ever allowed to hold, anything else dropped the same way a
 * hand-crafted, out-of-vocabulary `return_format` already is -- so a
 * request that bypasses `FieldEditor`'s own `<select>` entirely can never
 * store some OTHER literal string here that this type was never designed
 * to resolve.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Date_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'date';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Date', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * `Advanced` -- the same category `Permalink_Field_Type` already
	 * calls home, a fitting one for a specialized picker like ACF itself
	 * files its own Date Picker under.
	 */
	public static function category() {
		return 'Advanced';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'date';
	}

	/**
	 * @inheritDoc
	 *
	 * A genuine, native `<input type="date">` -- see this class's own
	 * docblock for why that alone is what makes "provide user with date
	 * picker" true, with no dedicated `RecordForm` render branch needed.
	 */
	public static function input_type() {
		return 'date';
	}

	/**
	 * @inheritDoc
	 *
	 * Defensive normalization, not a strict parser: `RecordForm`'s own
	 * `<input type="date">` already only ever sends a real `"Y-m-d"`
	 * string (or an empty one) to begin with, so this exists to catch
	 * anything else -- a hand-crafted request, a value arriving through
	 * some other path entirely -- reducing whatever `strtotime()` can
	 * make sense of down to that same canonical shape (discarding any
	 * time component a fuller datetime string might carry) rather than
	 * storing raw, un-normalized input a `DATE` column would likely
	 * reject outright. Genuinely unparsable input is dropped to `null`,
	 * the same "can't make sense of it, so treat it as unset" fallback
	 * `Number_Field_Type::cast()` already gives non-numeric input.
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		$timestamp = strtotime( (string) $value );

		return false === $timestamp ? null : gmdate( 'Y-m-d', $timestamp );
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
	 * A plain `"Y-m-d"` string is safe, meaningful plain text -- printing
	 * a record's own date via `gateway/card-field-text` is a real,
	 * sensible use, the same reasoning `Permalink_Field_Type::is_text_renderable()`
	 * already gives for its own plain string value.
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
	 * Deliberately `null`, not Eloquent's own native `'date'` cast -- see
	 * this class's own docblock for why: a `Carbon` instance would
	 * serialize a GET response out as a full ISO-8601 timestamp, not the
	 * plain `"Y-m-d"` string `cast()` itself already stores and
	 * `RecordForm`'s own `<input type="date">` actually needs back.
	 */
	public static function eloquent_cast() {
		return null;
	}

	/**
	 * @inheritDoc
	 *
	 * `instructions` alone -- no `placeholder` here despite that being
	 * offered to several other basic types: a native `<input type="date">`
	 * already shows the current locale's own date format as its own
	 * built-in placeholder, with nothing meaningful left for a custom one
	 * to add.
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * `true` -- see this class's own docblock for the FOURTH distinct
	 * Default Value shape this enables (a fixed "None"/"Today's Date"
	 * choice, not a literal typed value).
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
	 * A calendar date isn't a quantity -- Currency/Percent/decimal-place
	 * formatting (`Number_Formatter::format()`) makes no sense applied to
	 * one, the same reasoning `True_False_Field_Type::is_numeric()`
	 * already gives for its own real-but-non-quantity stored value.
	 */
	public static function is_numeric() {
		return false;
	}
}
