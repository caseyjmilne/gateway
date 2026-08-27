<?php
/**
 * "Relate to One" -- a field bound to one of this model's own `belongsTo`
 * relationships (Model_Relationships), storing the related record's id.
 *
 * Unlike every other field type, this one's `name` (and therefore real
 * column) is never typed in -- it's always the exact column Eloquent's
 * own `belongsTo()` convention expects for the chosen relationship
 * (`Str::snake( $relationship_method ) . '_id'`, e.g. "model_id" for a
 * relationship method `model()`), derived by Model_Fields::add() itself.
 * See that class's own handling of Relationship_Field_Type for the full
 * mechanism -- picking a relationship, deriving the name, and the
 * admin app's own autocomplete UI for actually selecting a related record.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Relate_To_One_Field_Type implements Relationship_Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'relate_one';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Relate to One', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'unsignedBigInteger';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as Text_Area_Field_Type's own 'textarea' --
	 * the admin app's RecordForm renders this as a search-as-you-type
	 * autocomplete (RelateAutocomplete.jsx) instead of any plain `<input>`.
	 */
	public static function input_type() {
		return 'relate_one';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		return is_numeric( $value ) ? (int) $value : null;
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
	public static function relationship_type() {
		return 'belongsTo';
	}
}
