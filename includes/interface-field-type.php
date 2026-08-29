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

	/**
	 * The Eloquent native cast name (`$casts`, e.g. "array"/"boolean") a
	 * generated model's own column for this type needs declared against
	 * it, or `null` for the default (no cast -- what every plain scalar
	 * type, text or numeric, already worked correctly without).
	 * `Model_Builder::rewrite_model_file()` prints whatever this returns
	 * into the generated model's own `$casts` property, so an attribute
	 * of this type is read back as the same real PHP type it was written
	 * as (a genuine array, a genuine bool), not the raw string/int the
	 * bare database driver would otherwise return it as.
	 *
	 * Not just a nicety for `Checkbox_Field_Type` ("Checkbox" -- multiple
	 * selections stored as one JSON array in a single text column,
	 * `blueprint_method() === 'text'`): without Eloquent's own 'array'
	 * cast actually doing the JSON encode/decode around it, assigning a
	 * genuine PHP array to that attribute at save time has nothing to
	 * turn it into a string the database driver can bind at all.
	 *
	 * `null` for every other built-in type, including every other Choice
	 * type (Buttons/Select/Radio each store one plain string -- their own
	 * `blueprint_method()` column already round-trips that correctly with
	 * no cast needed) and both relate field types (an id, or nothing).
	 *
	 * @return string|null
	 */
	public static function eloquent_cast();

	/**
	 * Which of the admin app's Field Editor's own generic "Presentation"
	 * settings (`FieldEditor.jsx`'s own `PRESENTATION_FIELD_META` catalog
	 * -- currently `instructions`/`placeholder`/`step`/`prepend`/`append`,
	 * a small vocabulary this method only ever selects a subset of; a new
	 * type-specific need like `step` below is added to the catalog itself,
	 * not invented ad hoc by a single type) this type actually recognizes
	 * -- a type declares this about *itself*, the same "no hardcoded
	 * per-type list living somewhere else" reasoning `is_filterable()`/
	 * `is_text_renderable()` already establish, rather than
	 * `Model_Fields::sanitize_settings()` (the one place this is actually
	 * enforced -- see that method's own docblock) hardcoding which types
	 * get which settings.
	 *
	 * This is also the answer to "different field types will need
	 * different extra data, stored how": `gateway_fields` gets one new
	 * generic `settings` column (a JSON object, arbitrary shape, `{}` for
	 * a field whose type recognizes none of the fixed catalog above) --
	 * never one dedicated column per possible per-type option, which
	 * would mean a schema migration every time any type anywhere gained
	 * one more presentation setting. This method is what keeps that one
	 * shared JSON blob from becoming a free-for-all: only a type's own
	 * declared subset of the fixed key catalog ever survives
	 * `sanitize_settings()`, whatever a request actually sends.
	 *
	 * `['instructions']` -- and nothing else -- for every built-in type
	 * except `Text_Field_Type`/`Number_Field_Type`/`Range_Field_Type`/
	 * `Email_Field_Type`/`URL_Field_Type`/`Password_Field_Type`
	 * (`instructions` plus `placeholder`/`prepend`/`append`, and, for
	 * Number/Range only, `step` -- the HTML `<input type="number"|"range">`
	 * `step` attribute; recognized by no other type, since it means
	 * nothing for a plain string). Email and Password both recognize the
	 * same three as Text (no `step` -- meaningless for either), the same
	 * "nothing about this type's own semantics changes what a
	 * placeholder/prepend/append mean" reasoning -- Email also carries
	 * that reasoning into `supports_default_value()` below, Password
	 * deliberately does NOT (see that method's own docblock). URL
	 * recognizes `placeholder` ONLY, no `prepend`/`append` -- unlike an
	 * email address, flanking a URL with a "$"/"USD"-style addon reads as
	 * nonsense, so those two are deliberately left out of its own catalog
	 * rather than offered and just never making sense in practice.
	 * `instructions` is universal -- a short note under a field's own
	 * label is meaningful for literally any field type, unlike the other
	 * four -- so unlike them it's never gated by anything past this
	 * method simply always including it. The order a type returns these
	 * in is the order the Presentation tab renders them in, not just
	 * which ones appear -- `instructions` always comes first (`RecordForm`
	 * renders it as the very first thing under a field's own label,
	 * before its control), and `Number_Field_Type`/`Range_Field_Type`
	 * return `step` right after `placeholder` and before `prepend` for
	 * the same reason.
	 *
	 * @return string[] Subset of `['instructions', 'placeholder', 'step', 'prepend', 'append']`, in display order, always including `'instructions'`.
	 */
	public static function presentation_fields();

	/**
	 * Whether a field of this type can be given a configurable default
	 * value -- shown in `FieldEditor.jsx`'s own **General** tab, directly
	 * under Label (not Presentation, unlike everything `presentation_fields()`
	 * governs above: a default is what a new record starts out with, not
	 * how the field is displayed), and applied by `RecordForm` as the
	 * initial value of its own "Add New" form -- never on an existing
	 * record being edited, which already has a real value of its own to
	 * show instead.
	 *
	 * Stored the same way as everything `presentation_fields()` recognizes:
	 * one more key (`'default'`) in the same generic `settings` JSON
	 * column, gated by this method rather than added to
	 * `presentation_fields()` itself -- the two are deliberately separate
	 * because they answer different questions (which Presentation-tab
	 * inputs to show vs. whether a default value even makes sense for
	 * this type at all) and render in different tabs;
	 * `Model_Fields::sanitize_settings()` is what actually merges both
	 * into the one set of keys a given type's `settings` may ever contain.
	 *
	 * `true` for `Text_Field_Type`, `Number_Field_Type`, `Range_Field_Type`,
	 * `Email_Field_Type`, and `URL_Field_Type` today -- a default makes
	 * little sense for a Choice type (its own choices list already offers
	 * a natural "pick one" default the UI doesn't have yet) or a Relate
	 * field (a default related record raises its own set of questions --
	 * does it still exist, is it still valid -- this doesn't attempt to
	 * answer). `false` for every other built-in type.
	 *
	 * @return bool
	 */
	public static function supports_default_value();

	/**
	 * Whether a field of this type can be given a configurable maximum
	 * character length -- shown in `FieldEditor.jsx`'s own **Validation**
	 * tab, alongside Required (not Presentation or General: a character
	 * limit is an actual constraint on what can be saved, the same kind
	 * of thing Required already is, not a display or new-record-default
	 * concern), with its own "Leave blank for no limit." note underneath.
	 * Unlike Required, this is meaningless for every type except a plain
	 * multi- or single-line string -- `Text_Field_Type`/`Text_Area_Field_Type`
	 * only -- so it's a per-type opt-in the same way
	 * `supports_default_value()` is, not a column that applies uniformly
	 * everywhere the way `required` does.
	 *
	 * Stored the same way as everything else `settings` holds: one more
	 * key (`'character_limit'`) in the same generic JSON column, gated by
	 * this method and merged in by `Model_Fields::sanitize_settings()`
	 * alongside `presentation_fields()`/`supports_default_value()`'s own
	 * keys. Actually enforced -- not just recorded -- by
	 * `Model_Fields::validate_character_limits()`, called by
	 * `Records_REST_Controller::create_record()`/`update_record()` the
	 * same way `validate_required_fields()` already is.
	 *
	 * `true` only for `Text_Field_Type` and `Text_Area_Field_Type` today.
	 * `false` for every other built-in type, including `Number_Field_Type`/
	 * `Range_Field_Type` (a "character limit" on a number is a category
	 * error -- a numeric range has its own dedicated pair of settings,
	 * `supports_range_limits()` below, not this one).
	 *
	 * @return bool
	 */
	public static function supports_character_limit();

	/**
	 * Whether a field of this type can be given a configurable minimum
	 * and/or maximum numeric value -- shown in `FieldEditor.jsx`'s own
	 * **Validation** tab as "Minimum Value"/"Maximum Value", the same
	 * "an actual constraint, not a display/default concern, so it
	 * belongs in Validation" reasoning `supports_character_limit()`
	 * already follows for its own analogous setting on a string type.
	 * Either bound, or both, or neither can be configured -- a range
	 * with only a floor, only a ceiling, or neither is a perfectly valid
	 * configuration, not an error.
	 *
	 * Stored the same way as everything else `settings` holds: two more
	 * keys (`'min_value'`/`'max_value'`) in the same generic JSON column,
	 * gated by this method and merged in by `Model_Fields::
	 * sanitize_settings()` alongside `presentation_fields()`/
	 * `supports_default_value()`/`supports_character_limit()`'s own keys
	 * -- unlike those, a value here must actually be numeric (not merely
	 * a positive whole number the way `character_limit` must be; a
	 * negative or fractional min/max is entirely legitimate) or it's
	 * dropped, same as leaving it blank. Actually enforced -- not just
	 * recorded, and not just an `<input type="range">`'s own `min`/`max`
	 * attribute in `RecordForm` (a client-side convenience only, exactly
	 * like `character_limit`'s own `maxLength`) -- by a new
	 * `Model_Fields::validate_range_values()`, called by
	 * `Records_REST_Controller::create_record()`/`update_record()` the
	 * same way `validate_required_fields()`/`validate_character_limits()`
	 * already are, including the same "skipped entirely for a field
	 * hidden by its own Conditional Logic" treatment both of those give.
	 *
	 * `true` only for `Range_Field_Type` today -- a numeric bound is
	 * already what `Number_Field_Type` itself represents without needing
	 * a UI slider to visualize it, so this is Range-specific rather than
	 * shared with Number the way `step` is. `false` for every other
	 * built-in type.
	 *
	 * @return bool
	 */
	public static function supports_range_limits();
}
