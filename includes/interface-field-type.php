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
	 * Which group `FieldEditor.jsx`'s own Type picker files this type
	 * under -- one of `'Basic'`/`'Content'`/`'Choice'`/`'Relational'`/
	 * `'Advanced'`/`'Layout'`, the same six ACF itself groups its own
	 * field types into (mirrored here specifically so this stays a
	 * familiar picker to anyone who's used ACF's own, not because
	 * anything server-side reads or enforces the value). Purely cosmetic
	 * grouping/searchability, unlike every other method here -- nothing
	 * about how a field type actually behaves depends on which category
	 * it's in, so this is safe to get "wrong" (there's no canonical
	 * answer for a type ACF itself doesn't have, e.g. Relate to One/Many)
	 * without breaking anything.
	 *
	 * A category with no registered type in it simply never renders a
	 * heading in the picker -- Gateway has nothing in `'Advanced'`/
	 * `'Layout'` today (no date/color/map pickers, no repeater/group/tab
	 * constructs), but the six-category vocabulary stays fixed so a
	 * future type effectively picks its own home rather than the picker
	 * needing a seventh category invented for it.
	 *
	 * @return string
	 */
	public static function category();

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
	 * Whether this type's own stored value is genuine HTML that a
	 * display block should render TRUSTED -- as real markup, never
	 * escaped -- rather than the plain string `is_text_renderable()`
	 * already covers. A deliberately separate flag, not a second meaning
	 * folded into `is_text_renderable()` itself: that one's own contract
	 * (see its own docblock) is specifically "safe to print AS PLAIN
	 * TEXT," which every OTHER consumer of it -- `Permalink_Field_Type`'s
	 * own Source Field eligibility, a Select/Checkboxes facet's own
	 * comparison, the admin app's own Records table cell display --
	 * still needs to mean exactly that; genuine HTML is neither
	 * meaningfully slugifiable nor safe to compare/display as a raw
	 * string, so it was never a good fit to just flip `is_text_renderable()`
	 * to `true` for a type this is true for instead.
	 *
	 * `true` only for `WYSIWYG_Field_Type` (a real WordPress classic
	 * -editor value -- `<p>`/`<br>` and the like, exactly what makes its
	 * own stored value genuine markup rather than plain text to begin
	 * with; see that class's own docblock) -- `false` for every other
	 * built-in type, `Text_Area_Field_Type`'s own plain multi-line string
	 * included (already covered by `is_text_renderable()` instead, with
	 * no HTML of its own to trust). `gateway/card-field-text`'s own Field
	 * picker offers a field whenever EITHER this or `is_text_renderable()`
	 * is `true` -- the same block now doubles as this type's own display,
	 * rather than a second, near-identical block existing solely to flip
	 * one rendering detail; its own render.php/edit.js are what actually
	 * decide, per field, whether to print the resolved value raw or
	 * escaped.
	 *
	 * @return bool
	 */
	public static function is_html_renderable();

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

	/**
	 * Whether a field of this type has its own bundle of media-specific
	 * settings -- `true` only for `Image_Field_Type` today. Unlike the
	 * other `supports_*()` methods above, which each gate ONE or TWO
	 * settings, this one gates a whole cluster at once, because they're
	 * all specific to the same one type and all answer variations of the
	 * same underlying question ("how should this field pick/validate/
	 * display an attachment"), not because they're a different *shape* of
	 * data than everything else `settings` already holds (they're not --
	 * every one of them is still a flat string in the same generic
	 * `gateway_fields.settings` JSON column, `Model_Fields::sanitize_settings()`
	 * merges them in exactly like `character_limit`/`min_value`/`max_value`
	 * are). Adding a THIRD media-capable type later would mean this
	 * method returning `true` for it too, not a new method of its own.
	 *
	 * The keys this gates (`FieldEditor.jsx`'s own General/Validation
	 * tabs, `RecordForm`'s own media picker, `Model_Fields::
	 * validate_attachment_constraints()`):
	 * - `return_format` (General) -- one of `'array'`/`'url'`/`'id'`,
	 *   what shape a record's own GET response gives this field's value
	 *   (the full ACF-style `{id, url, alt, width, height, sizes}`, just
	 *   the URL string, or just the raw attachment id). Invalid/missing
	 *   defaults to `'array'` client-side, not stored as a literal
	 *   default here.
	 * - `min_width`/`min_height`/`min_size`/`max_width`/`max_height`/
	 *   `max_size` (Validation) -- each independently optional, each
	 *   numeric and non-negative (unlike `min_value`/`max_value` above, a
	 *   negative dimension or file size is never legitimate). Actually
	 *   enforced -- not just recorded -- by `Model_Fields::
	 *   validate_attachment_constraints()` (also shared with
	 *   `supports_file_settings()` below -- see that method's own
	 *   docblock for why one method serves both), the same "client hint
	 *   (a rejected pick in the media modal), server enforces" split
	 *   every other Validation-tab setting already has.
	 * - `allowed_types` (Validation) -- a free-text, comma-or-space
	 *   separated list of file extensions (e.g. `"jpg,png,gif"`),
	 *   filtering both the media modal's own library query and the
	 *   server-side check.
	 *
	 * NOT gated here: `preview_size` (General... actually Presentation)
	 * is Image_Field_Type's own `presentation_fields()` entry instead --
	 * it's a genuine Presentation-tab concern (how big a thumbnail
	 * RecordForm shows while editing), the same category placeholder/
	 * prepend/append already belong to, not a validation constraint or a
	 * General-tab picker-behavior setting the way everything else here is.
	 *
	 * @return bool
	 */
	public static function supports_media_settings();

	/**
	 * Whether a field of this type has its own bundle of generic-file
	 * settings -- `true` only for `File_Field_Type` today. `File_Field_Type`'s
	 * own close sibling to `supports_media_settings()` above, same
	 * "gates a whole cluster at once" reasoning and same underlying
	 * storage (still just flat strings in the generic `settings` JSON
	 * column) -- kept as its OWN method rather than folded into
	 * `supports_media_settings()` because the two clusters genuinely
	 * differ, not just in which type happens to use them: a generic file
	 * has no width/height to bound (there's no `wp_get_attachment_metadata()`
	 * dimensions for a PDF or a .zip the way there is for a raster
	 * image) and no `preview_size`/registered-image-sizes concept either
	 * -- gating both types off one flag would mean either exposing
	 * meaningless width/height inputs for File, or `Image_Field_Type`
	 * itself having to override which of the bundle's own keys actually
	 * apply to it, neither of which this two-flag split needs to do.
	 *
	 * The keys this gates (`FieldEditor.jsx`'s own General/Validation
	 * tabs, `RecordForm`'s own file picker, `Model_Fields::
	 * validate_attachment_constraints()`):
	 * - `return_format` (General) -- one of `'array'`/`'url'`/`'id'`,
	 *   the exact same three values `supports_media_settings()`'s own
	 *   `return_format` accepts and the exact same `Model_Fields::
	 *   sanitize_settings()` validation branch (keyed by name, not by
	 *   which of the two flags actually included it) -- what differs is
	 *   only the shape `Records_REST_Controller::resolve_file_value()`
	 *   builds for `'array'`: `{id, url, filename, title, mime_type,
	 *   filesize}`, no width/height/sizes, since none of those mean
	 *   anything for an arbitrary file.
	 * - `min_size`/`max_size` (Validation) -- in MB, independently
	 *   optional, numeric and non-negative -- the exact same two keys
	 *   `supports_media_settings()` already has, actually enforced by
	 *   the same `Model_Fields::validate_attachment_constraints()` that
	 *   enforces Image's own (that method reads whichever of
	 *   width/height/size keys a field's settings actually carry, so
	 *   File fields -- which never have min_width/max_height/etc. in the
	 *   first place, see `sanitize_settings()` -- simply never trip
	 *   those checks, without needing a separate method of its own).
	 * - `allowed_types` (Validation) -- the same free-text extension
	 *   list as `supports_media_settings()`'s own, checked server-side
	 *   the same way -- but, unlike Image's own, NOT used to narrow the
	 *   media modal's own library query client-side: mapping an
	 *   arbitrary file extension (`.zip`, `.docx`, `.csv`, ...) to the
	 *   MIME type `wp.media()`'s own `library.type` filter expects has
	 *   no small, reliable lookup table the way the handful of image
	 *   formats `ImagePicker.jsx`'s own `EXTENSION_TO_MIME` covers does
	 *   -- `FilePicker.jsx` opens the library unrestricted instead,
	 *   relying on the pick-time client check (mirroring the server's
	 *   own) plus that server-side enforcement itself, the same
	 *   "narrower of the two available tools" trade-off, just landing on
	 *   the other tool than Image's own.
	 *
	 * NOT gated here (unlike `supports_media_settings()`): no
	 * `min_width`/`max_width`/`min_height`/`max_height` (nothing to
	 * bound), no `preview_size` (nothing to preview a thumbnail of) --
	 * `File_Field_Type::presentation_fields()` is just `instructions`,
	 * the universal baseline every type gets.
	 *
	 * @return bool
	 */
	public static function supports_file_settings();

	/**
	 * Whether a field of this type has its own "Embed Size" bundle --
	 * `true` only for `OEmbed_Field_Type` today. Gates `embed_width`/
	 * `embed_height` (both in px, both independently optional, each
	 * numeric and non-negative -- the exact same validation branch
	 * `Model_Fields::sanitize_settings()` already runs for Image's own
	 * `min_width`/etc., this just adds two more keys to it), read by
	 * `OEmbedPicker.jsx` as the `maxwidth`/`maxheight` it passes to
	 * WordPress's own oEmbed proxy (`GET /wp-json/oembed/1.0/proxy`) when
	 * fetching a preview -- unset falls back to WordPress's/ACF's own
	 * conventional default of 640×390, not a literal default stored
	 * here.
	 *
	 * Unlike `supports_media_settings()`/`supports_file_settings()`
	 * above, both of which gate settings shown on the **Validation**
	 * tab, this one's own two keys live on **General** instead -- ACF's
	 * own oEmbed field puts its "Embed Size" there too, since it's not a
	 * constraint on what can be saved (nothing here is actually
	 * enforced against the submitted value the way Image's own width/
	 * height bounds are against an uploaded file) but a display setting
	 * for how big the live preview/front-end embed renders, the same
	 * category of thing Return Format already is for Image/File.
	 *
	 * @return bool
	 */
	public static function supports_embed_settings();

	/**
	 * Whether a field of this type has its own "Return Format" setting --
	 * `true` only for `User_Field_Type` today. Gates exactly one key,
	 * `return_format` (General), reusing the SAME setting name AND the
	 * same `Model_Fields::sanitize_settings()` enum check
	 * `supports_media_settings()`/`supports_file_settings()` already
	 * have -- just a narrower slice of it: `'array'` (an enriched
	 * `{id, name, email, avatar_url}` object) or `'id'` (the bare WP user
	 * id) only, never `'url'` -- a WP user has no single canonical URL
	 * the way an attachment does (`get_author_posts_url()` names an
	 * archive-of-posts-by, not "the URL of this user", and would be a
	 * confusing thing to hand back under a generic `'url'` format).
	 * `FieldEditor.jsx`'s own Return Format `<select>` simply never
	 * offers a "User URL" option for this type -- there's no need for
	 * `Model_Fields::sanitize_settings()`'s own shared enum to be
	 * narrowed to match, the same "validated broadly, offered narrowly"
	 * split every other reused enum value in this interface already has.
	 *
	 * Unlike `supports_media_settings()`/`supports_file_settings()`,
	 * there's no Validation-tab bundle at all here -- a bare user id has
	 * no width/height/file-size/allowed-extension to bound the way an
	 * attachment does, so this gates General's own Return Format alone,
	 * nothing else.
	 *
	 * `true` only for `User_Field_Type` -- `false` for every other
	 * built-in type, including `Relate_To_One_Field_Type`/
	 * `Relate_To_Many_Field_Type` (a genuinely different kind of
	 * reference: another GATEWAY model's own record, resolved through
	 * `Model_Relationships`, not a bare WP user id resolved by hand the
	 * way `Records_REST_Controller::resolve_user_value()` does).
	 *
	 * @return bool
	 */
	public static function supports_user_settings();

	/**
	 * Whether a field of this type has its own bundle of permalink-specific
	 * settings -- `true` only for `Permalink_Field_Type` today. Gates
	 * `source_field`/`root`/`template_page_id` (all General-tab concerns --
	 * there's no Validation-tab bundle here at all, unlike
	 * `supports_media_settings()`/`supports_file_settings()`, since a
	 * slug's own uniqueness is enforced unconditionally by
	 * `Model_Fields::resolve_permalink_value()`, not something a site
	 * owner opts into via a Validation-tab setting):
	 *
	 * - `source_field` -- the name of ANOTHER field on the SAME model
	 *   whose value this field auto-slugifies from (e.g. tracking
	 *   "title"). Must name a real sibling field whose own type is
	 *   `is_text_renderable()` (reusing that existing flag as the
	 *   eligibility signal -- a Password or Relate to One/Many field, or
	 *   another Permalink field, was never a sensible thing to slugify),
	 *   enforced by `Model_Fields::validate_permalink_settings()`
	 *   (`FieldEditor.jsx`'s own Source Field `<select>` only ever offers
	 *   an eligible field to begin with, but this is what actually
	 *   enforces it against a hand-crafted request). Optional -- a
	 *   Permalink field with no `source_field` is manual-only, a plain
	 *   unique-slug input with no auto-slugify behavior at all.
	 * - `root` -- the URL path prefix every one of this model's own
	 *   records lives under, e.g. `"tickets"` for `/tickets/ticket-one`.
	 *   Run through `sanitize_title()` (not just `sanitize_text_field()`),
	 *   and rejected if any OTHER model's own Permalink field already
	 *   claims it (`Model_Fields::validate_permalink_settings()` again --
	 *   two models racing for the same `root` would otherwise make
	 *   `Permalink_Routes`' own rewrite rules ambiguous).
	 * - `template_page_id` -- the id of the WordPress Page a site owner
	 *   has built (with Gateway's own blocks, `gateway/single-record`
	 *   chief among them) to serve as this model's single-record
	 *   template. `Permalink_Routes::register_rules()` only ever
	 *   registers a rewrite rule for a model once BOTH `root` and this
	 *   are set -- a `root` alone, with no template page chosen yet,
	 *   simply doesn't route yet, a deliberate, explainable phase-1 gap
	 *   rather than a bare built-in fallback template.
	 *
	 * Unlike every other `supports_*_settings()` flag above, this one's
	 * own field type ALSO sets `max_one_per_model()` -- see that
	 * method's own docblock for why a model only ever has at most one of
	 * these to configure in the first place.
	 *
	 * @return bool
	 */
	public static function supports_permalink_settings();

	/**
	 * Whether a model can ever have more than one field of this type at
	 * once -- `true` only for `Permalink_Field_Type` today, per the
	 * user's own explicit request: a model's own single-record URL
	 * (`root` + one field's own slug) is one fact about that model, not
	 * something that makes sense to configure twice. A field type
	 * declares this about *itself*, the same "declare it about yourself"
	 * reasoning `is_filterable()`/`is_text_renderable()` already use,
	 * rather than `Model_Fields::add()`/`update()` hardcoding a specific
	 * type key (`'permalink' === $type`) that every future type with the
	 * same constraint would need its own copy of.
	 *
	 * Enforced by `Model_Fields::add()` (a second field of a
	 * `max_one_per_model()` type on the same model is rejected outright)
	 * and `update()` (excludes the field currently being edited from that
	 * same check, so re-saving it doesn't trip over itself, but still
	 * blocks retyping a DIFFERENT field into one when the model already
	 * has one). `false` for every other built-in type.
	 *
	 * @return bool
	 */
	public static function max_one_per_model();

	/**
	 * Whether this type's own stored value is a real number -- the same
	 * "declare it about yourself" reasoning `is_filterable()`/
	 * `is_text_renderable()` already use, this time deciding which
	 * fields `gateway/card-field-number`'s own Field picker offers at
	 * all (and rejects a stale/hand-crafted `fieldKey` for on the front
	 * end, the same way `is_text_renderable()` already protects
	 * `gateway/card-field-text`), and which of a Data Table's own
	 * columns get a "Format" button in its column-config UI at all.
	 *
	 * `true` only for `Number_Field_Type`/`Range_Field_Type` -- both
	 * store a genuine PHP int/float (`blueprint_method() => 'double'`
	 * either way), the only two built-in types `Number_Formatter::format()`
	 * (Currency/Percent/decimal-place formatting) produces a meaningful
	 * result for. `false` for every other built-in type, `True_False_Field_Type`
	 * included: its own stored value is a real column too, but
	 * semantically a boolean, not a quantity anyone would want a
	 * currency symbol or decimal places applied to.
	 *
	 * @return bool
	 */
	public static function is_numeric();
}
