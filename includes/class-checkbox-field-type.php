<?php
/**
 * The "Checkbox" field type -- any number (zero or more) of the field's
 * own configured choices (Model_Field_Choices) selected at once, rendered
 * as a group of independently-toggled checkboxes. The only built-in
 * Choice_Field_Type where is_multiple() is true.
 *
 * Stored as one JSON array in a single `text` column (blueprint_method()),
 * via Eloquent's own 'array' cast (eloquent_cast()) -- Model_Builder
 * prints that cast into the generated model's own `$casts`, so reading
 * this attribute back always gives a real PHP array (never a raw JSON
 * string a caller would have to remember to decode themselves), the same
 * way `$table->id()` always gives a real int without any caller-side
 * casting of its own.
 *
 * Deliberately not filterable/text-renderable -- see is_filterable()/
 * is_text_renderable()'s own docblocks below for why an array value
 * doesn't fit either concern the way a plain scalar choice type's value
 * does.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Checkbox_Field_Type implements Choice_Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'checkbox';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Checkbox', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function category() {
		return 'Choice';
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
		return 'checkboxes';
	}

	/**
	 * Normalizes an incoming value (a JSON request body's own array of
	 * strings -- the normal case; a bare scalar is tolerated too, treated
	 * as a single-item selection, e.g. a REST client posting one value
	 * without wrapping it) into a de-duplicated, order-preserving array of
	 * non-empty strings -- what Eloquent's own 'array' cast (see
	 * eloquent_cast()) then JSON-encodes for storage.
	 *
	 * Never validated here against the field's own currently-configured
	 * choices -- cast() is a stateless, per-type operation with no access
	 * to which field (or which model) this value is even for; a stale
	 * checked value from a choice since removed from the list is simply
	 * carried over as-is, the same "doesn't retroactively repair old
	 * records" tradeoff Model_Fields::update()/remove() already accept
	 * elsewhere for name/type changes.
	 *
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value ) {
			return array();
		}

		$items = is_array( $value ) ? $value : array( $value );

		$strings = array_map(
			function ( $item ) {
				return trim( (string) $item );
			},
			$items
		);

		return array_values(
			array_unique(
				array_filter(
					$strings,
					function ( $item ) {
						return '' !== $item;
					}
				)
			)
		);
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
	 * There's no single scalar here to compare a facet's own value
	 * against -- Facet_Query's own meta/core-column branches (and their
	 * Collection counterparts) only ever match one stored value at a
	 * time, the same "no scalar to compare against" reasoning
	 * Relate_To_Many_Field_Type::is_filterable() already gives.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * gateway/card-field-text prints `(string) $value` -- casting an array
	 * to a string in PHP emits an "Array to string conversion" warning and
	 * prints the literal word "Array", never anything a visitor could
	 * read. A dedicated block that joins the selected choices (or lists
	 * them) is real, separate, undone work.
	 */
	public static function is_text_renderable() {
		return false;
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
		return 'array';
	}

	/**
	 * @inheritDoc
	 */
	public static function is_multiple() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
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
	 */
	public static function is_numeric() {
		return false;
	}
}
