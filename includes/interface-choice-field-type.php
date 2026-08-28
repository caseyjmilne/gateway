<?php
/**
 * The contract a "choice" field type implements on top of Field_Type -- a
 * field whose value is always one of a small, site-owner-defined set of
 * options (Buttons_Field_Type, Select_Field_Type, Radio_Field_Type,
 * Checkbox_Field_Type today), rather than free-form input.
 *
 * The choices themselves are never part of this interface, or of a field
 * type's own class at all -- they're per-*field* data (two Select fields
 * on two different models, or even two Select fields on the same model,
 * each have their own completely independent list), so they're recorded
 * in their own dedicated table (see Model_Field_Choices), the same way a
 * relate field's own related model is recorded in Model_Relationships
 * rather than baked into Relate_To_One_Field_Type's own class. Only the
 * one thing that genuinely IS fixed per type lives here.
 *
 * Detected via `is_subclass_of( $type_class, Choice_Field_Type::class )`,
 * the same pattern Relationship_Field_Type already established -- every
 * existing field type (Text, Number, ..., Relate to One/Many) is
 * untouched; only a type that actually needs a configured choice list
 * implements this.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

interface Choice_Field_Type extends Field_Type {

	/**
	 * Whether a field of this type can ever hold more than one of its own
	 * configured choices at once.
	 *
	 * `true` for Checkbox_Field_Type only -- its value is a JSON array of
	 * however many of the field's own choices are checked (`[]` if none),
	 * stored in one `text` column via Eloquent's own 'array' cast (see
	 * Field_Type::eloquent_cast()). `false` for Buttons/Select/Radio --
	 * exactly one choice (or none selected at all) is ever meaningful for
	 * those, stored as a plain string in a `string` column, the same way
	 * a Text field's own value is.
	 *
	 * What Model_Fields::sanitize_record_data() ultimately governs via
	 * each type's own cast() (a single string vs. an array of strings),
	 * and what the admin app's record form (RecordForm.jsx) reads to
	 * decide whether a field renders as a group of independently-toggled
	 * checkboxes or a single-selection control (Select/Radio/Buttons).
	 *
	 * @return bool
	 */
	public static function is_multiple();
}
