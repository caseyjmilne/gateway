<?php
/**
 * The "Permalink" field type -- the URL slug for one of this model's own
 * records (e.g. "ticket-one" in "/tickets/ticket-one"), stored as a plain
 * string column (Schema Blueprint's `string()`, no different from a Text
 * field's own column).
 *
 * Unlike every other built-in type, this field's own stored value is
 * never trusted straight off `cast()` alone -- `cast()` here is a purely
 * defensive `sanitize_title()` pass (never storing something that isn't
 * already URL-safe, if this value somehow reaches storage through a path
 * that skips the real logic below), not the authoritative computation.
 * The REAL slug -- auto-slugified from this field's own configured
 * `source_field`, or taken literally in Manual mode, either way made
 * unique against the model's own table -- is computed by
 * `Model_Fields::resolve_permalink_value()`, called by
 * `Records_REST_Controller::create_record()`/`update_record()` before
 * any of `cast()`'s own per-field, no-sibling-access work even runs (see
 * that method's own docblock for the full Auto/Manual mechanics, and
 * why a `{field_name}__manual` companion column -- not this field's own
 * value alone -- is what actually remembers which mode a given RECORD
 * is in).
 *
 * `supports_permalink_settings()` is `true` -- see that interface
 * method's own docblock for the `source_field`/`root`/`template_page_id`
 * bundle it gates. `max_one_per_model()` is also `true` -- see that
 * interface method's own docblock for why a model only ever configures
 * one of these.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Permalink_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'permalink';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Permalink', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * `Advanced` -- currently empty (no built-in type has picked it
	 * before this one), and a fitting home either way: a specialized,
	 * single-use-case type, the same category ACF-style plugins would
	 * file a slug/permalink field under alongside other power-user tools.
	 */
	public static function category() {
		return 'Advanced';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'string';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as every other non-native `input_type()` in
	 * this plugin (`Image_Field_Type`'s own `'image'`, etc.) --
	 * `RecordForm` renders this as its own read-only-by-default,
	 * switch-to-edit slug control (`PermalinkControl`), never a plain
	 * `<input>`.
	 */
	public static function input_type() {
		return 'permalink';
	}

	/**
	 * @inheritDoc
	 *
	 * Defensive only -- see this class's own docblock for why the real,
	 * authoritative slug computation happens elsewhere
	 * (`Model_Fields::resolve_permalink_value()`), with full access to
	 * this field's own configured `source_field` and the rest of the
	 * request `cast()` alone never has.
	 */
	public static function cast( $value ) {
		return null === $value ? null : sanitize_title( (string) $value );
	}

	/**
	 * @inheritDoc
	 */
	public static function is_sensitive() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A "contains" search against a record's own slug is a perfectly
	 * meaningful thing to filter/facet by -- unlike a Relate field's own
	 * bare id, a slug IS the value, human-readable and unique by
	 * construction.
	 */
	public static function is_filterable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * A slug is safe, meaningful plain text -- `gateway/card-field-text`
	 * printing a record's own permalink field (e.g. to build a link) is
	 * a real, sensible use, unlike a Password/Relate field's own raw
	 * value.
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
	 * `instructions` only -- a slug's own format is fixed (URL-safe,
	 * unique), not something `placeholder`/`prepend`/`append` would mean
	 * anything for.
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default slug shared by every new record would immediately
	 * collide with itself the moment a second record was ever created --
	 * never a sensible setting for this type, unlike Text/Number/Range.
	 */
	public static function supports_default_value() {
		return false;
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full `source_field`/`root`/`template_page_id`
	 * bundle it gates.
	 */
	public static function supports_permalink_settings() {
		return true;
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for why a model only ever has at most one of these.
	 */
	public static function max_one_per_model() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_numeric() {
		return false;
	}
}
