<?php
/**
 * "Relate to Many" -- a field bound to one of this model's own
 * `belongsToMany` relationships (Model_Relationships), letting a record
 * be linked to any number of another model's records via a pivot table.
 *
 * The one field type with NO real column of its own at all: a many-to
 * -many relationship's data lives in a pivot table (see Model_Relationships::
 * ensure_pivot_table(), created automatically when the relationship
 * itself is added), never a column on either model's own table --
 * `blueprint_method()` returning '' is this type's own signal of that
 * ("no column, don't migrate one") to Model_Fields::add()/update()/
 * remove(), which all special-case it. `cast()` normalizes a submitted
 * value to a plain array of ids regardless (a Checkboxes-style multi
 * -select's worth of related records), but Records_REST_Controller never
 * actually writes that array to a column -- it extracts it
 * (Model_Fields::extract_relate_many_data()) and calls the relationship's
 * own `sync()` instead.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Relate_To_Many_Field_Type implements Relationship_Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'relate_many';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Relate to Many', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * '' -- not a real Schema Blueprint method at all -- signals "this
	 * field has no column of its own" to Model_Fields, which skips
	 * generating/running a migration for it entirely (see that class's
	 * own add()/update()/remove()).
	 */
	public static function blueprint_method() {
		return '';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- the admin app's RecordForm renders
	 * this as a search-as-you-type, multi-select autocomplete
	 * (RelateAutocomplete.jsx) instead of any plain `<input>`.
	 */
	public static function input_type() {
		return 'relate_many';
	}

	/**
	 * @inheritDoc
	 *
	 * @param mixed $value A single id, or an array of ids -- always
	 *                       normalized to a deduplicated array of positive
	 *                       ints, dropping anything that isn't one.
	 */
	public static function cast( $value ) {
		$ids = array_map( 'absint', (array) $value );

		return array_values( array_unique( array_filter( $ids ) ) );
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
	 * There isn't even a column here to facet by (see blueprint_method()
	 * above) -- a Relate to Many field's own value only ever exists as
	 * pivot-table rows, never a scalar Facet_Query's `meta`/core-column
	 * branches could compare against in the first place.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * There isn't even a real column here (see blueprint_method() above)
	 * -- a Relate to Many field's own "name" is the relationship's own
	 * method name, so reading it as a plain attribute returns the
	 * relationship itself (an Illuminate\Support\Collection), which PHP
	 * can't cast to a string at all. Printing one of these as text would
	 * fatal error, not just show something meaningless.
	 */
	public static function is_text_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function relationship_type() {
		return 'belongsToMany';
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return null;
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
}
