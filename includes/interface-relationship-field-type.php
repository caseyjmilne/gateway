<?php
/**
 * The contract a "relationship field type" implements on top of Field_Type
 * -- a field whose value isn't just a plain scalar, but a reference to
 * another model's record(s), via one of the model's own already-configured
 * relationships (Model_Relationships).
 *
 * Only Relate_To_One_Field_Type (`belongsTo`) and Relate_To_Many_Field_Type
 * (`belongsToMany`) implement this today. Detected via `is_subclass_of(
 * $type_class, Relationship_Field_Type::class )` rather than a new key on
 * the plain Field_Type interface -- this keeps every existing field type
 * (Text, Number, TextArea, Range, Email, URL, Password) untouched; only
 * the two types that actually need this extra behavior implement it.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

interface Relationship_Field_Type extends Field_Type {

	/**
	 * @return string One of Model_Relationships::TYPES' own keys this
	 *                  field type binds to ('belongsTo' or
	 *                  'belongsToMany') -- which of a model's already
	 *                  -configured relationships (Model_Relationships::all())
	 *                  are valid choices for a field of this type.
	 */
	public static function relationship_type();
}
