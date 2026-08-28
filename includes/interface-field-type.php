<?php
/**
 * Contract every registered field type implements -- what
 * Field_Type_Registry stores, and what Model_Fields and the REST API
 * read to know how a given field type actually behaves: which Schema
 * Blueprint column method creates/modifies its column, which HTML
 * <input> type the admin app should render it as, and how a raw
 * incoming value (from a REST request body, always a string or null
 * over JSON, occasionally a native int/float since JSON has its own
 * number type) should be cast before being saved.
 *
 * This is the "single class per field type, controlling that type's own
 * attributes" the Field Editor and record CRUD UI are both built on --
 * see Text_Field_Type/Number_Field_Type for the two built-in
 * implementations, and Field_Type_Registry for how one gets registered.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

interface Field_Type {

	/**
	 * @return string Machine identifier, e.g. "text" -- what a field's
	 *                 own 'type' value actually stores.
	 */
	public static function key();

	/**
	 * @return string Human-friendly label, e.g. "Text".
	 */
	public static function label();

	/**
	 * @return string Schema Blueprint column-builder method this type's
	 *                 column is created/modified with (see Model_Fields),
	 *                 e.g. "string".
	 */
	public static function blueprint_method();

	/**
	 * @return string HTML <input> "type" attribute the admin app's Field
	 *                 Editor and record CRUD forms should render this
	 *                 type as, e.g. "text" or "number".
	 */
	public static function input_type();

	/**
	 * @param mixed $value Raw incoming value.
	 * @return mixed Value cast to what this type actually stores.
	 */
	public static function cast( $value );

	/**
	 * Whether this type's own values should be masked wherever they're
	 * displayed in a list rather than an individual record's own edit
	 * form (RecordsCrud's table -- see Password_Field_Type, the only
	 * built-in type this is true for). Doesn't change how the value is
	 * stored or cast, or gate the value from the REST response itself --
	 * this is purely a display hint the admin app reads via
	 * Field_Type_Registry::describe_all(), same as input_type().
	 *
	 * @return bool
	 */
	public static function is_sensitive();

	/**
	 * Whether a field of this type is ever a sensible thing to filter/
	 * facet a Data Table or Data Cards grid by -- what `Column_Registry::
	 * get_columns_for_collection()` reads to decide a field's own
	 * `isFilterable`/`facetType` (`false` here means both a flat `[]`,
	 * regardless of anything a `gateway_datatable_collection_facet_type`
	 * filter might otherwise try to add back -- see that method's own
	 * docblock). A field type declares this about *itself*, rather than
	 * `Column_Registry` hardcoding a per-type exclusion list of its own
	 * (`is_subclass_of( $type_class, Relationship_Field_Type::class )`,
	 * a specific type key, ...) that every new type would need to
	 * remember to be added to.
	 *
	 * `false` for `Password_Field_Type` (a secret value has no legitimate
	 * reason to be searchable/facetable at all -- independent of, if
	 * overlapping with, `is_sensitive()`'s own masking-on-display
	 * concern) and for `Relate_To_One_Field_Type`/`Relate_To_Many_Field_Type`
	 * (a relate field's own stored value -- a bare foreign-key id, or
	 * nothing at all for Relate to Many -- was never a meaningful thing
	 * to facet by; a facet showing raw, unlabeled ids as its Select/
	 * Checkboxes options would be actively confusing, and `Facet_Query`
	 * has no notion of filtering *through* a relationship in the first
	 * place). `true` for every other built-in type.
	 *
	 * @return bool
	 */
	public static function is_filterable();

	/**
	 * Whether a field of this type's own raw stored value is a sensible
	 * thing to print as plain text -- what `Column_Registry::
	 * get_columns_for_collection()` reads to decide a field's own
	 * `isTextRenderable`, which `gateway/card-field-text` uses both to
	 * decide which fields its own Field picker even offers and, on the
	 * front end, to refuse a stale/hand-crafted `fieldKey` its own
	 * picker would never have offered in the first place -- the same
	 * "declare it about yourself" reasoning `is_filterable()` already
	 * uses, rather than `Column_Registry`/that block hardcoding a
	 * per-type exclusion list of its own that every new type would need
	 * to remember to be added to.
	 *
	 * `false` for `Password_Field_Type` (a secret value has no
	 * legitimate reason to ever be printed as plain, visible text on a
	 * public-facing card -- independent of, if overlapping with,
	 * `is_sensitive()`'s own masking-on-*admin-list* concern, and
	 * `is_filterable()`'s own searchability concern) and for
	 * `Relate_To_One_Field_Type`/`Relate_To_Many_Field_Type` (a relate
	 * field's own raw stored value -- a bare foreign-key id, or, for
	 * Relate to Many, nothing at all: its own field name isn't even a
	 * real column, it's the relationship's own method name, so reading
	 * it as a plain attribute would return the *relationship* itself,
	 * an `Illuminate\Support\Collection` object PHP can't cast to a
	 * string at all -- was never a meaningful or even safe thing to
	 * print as text; a related record's own label needs
	 * `Records_REST_Controller::resolve_display_field()`/`record_option()`,
	 * which neither `Column_Registry::resolve_collection_value()` nor
	 * `gateway/card-field-text/render.php` attempt). `true` for every
	 * other built-in type.
	 *
	 * @return bool
	 */
	public static function is_text_renderable();
}
