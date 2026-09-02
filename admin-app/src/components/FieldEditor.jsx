import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useRelationshipTypes from '../hooks/useRelationshipTypes.js';
import useImageSizes from '../hooks/useImageSizes.js';
import ChoicesEditor from './ChoicesEditor.jsx';
import ConditionalLogicEditor from './ConditionalLogicEditor.jsx';
import TypeSelect from './TypeSelect.jsx';

const AUTOSAVE_DEBOUNCE_MS = 800;

// The admin app's own fixed catalog of "Presentation" settings -- see
// Gateway\Field_Type::presentation_fields()'s own docblock for why this
// is a small, fixed vocabulary a type only ever selects a SUBSET of,
// rather than each type inventing its own arbitrary keys: one shared
// catalog here is what lets this component render any of them generically
// (an `<input>` or `<textarea>` per recognized key, looked up by name)
// instead of needing its own hardcoded UI for every field type that ever
// gains a presentation setting. `hint`, where present, is a purely local,
// admin-app-only aid for this input itself (Prepend/Append's own
// direction isn't otherwise obvious from the label alone) -- rendered as
// a plain `.description` note under the input, same as Name's own in
// General; it's never sent to the server or stored anywhere.
const PRESENTATION_FIELD_META = {
	placeholder: { label: 'Placeholder', type: 'text' },
	step: { label: 'Step Size', type: 'number' },
	prepend: { label: 'Prepend', type: 'text', hint: 'Appears before the input.' },
	append: { label: 'Append', type: 'text', hint: 'Appears after the input.' },
	instructions: { label: 'Instructions', type: 'textarea' },
	// `options` is deliberately left out here -- this catalog is a static
	// module-level constant, but the actual list of image sizes is a
	// per-site, dynamically-fetched thing (`useImageSizes()`); the render
	// loop below merges the live list in at render time instead of it
	// living here.
	preview_size: { label: 'Preview Size', type: 'select' },
};

// A defensive normalizer for `field.settings` -- belt-and-suspenders
// alongside `Gateway\\Model_Fields::for_rest_response()` on the PHP
// side, which is what actually fixed the real bug this guards against
// (see that method's own docblock): a field with no `settings`
// configured yet used to arrive here as a genuine JS ARRAY (`[]`), not
// an object, because PHP's own `wp_json_encode()` can't tell an empty
// array meant as `{}` from one meant as `[]`. `field.settings || {}`
// alone was never enough to catch that -- `[]` is truthy in JS, so the
// `||` never fell through -- and once `settings` was seeded as an array,
// setting a *named* property on it via `register('settings.default')`,
// etc. still silently "worked" (arrays are plain objects underneath),
// right up until `JSON.stringify()` on the whole `values.settings`
// object dropped every one of those non-numeric-index properties on the
// way out in the next autosave, indistinguishable from having typed
// nothing at all. The PHP fix already stops `settings` from arriving
// this way in the first place; this stays as a second line of defense
// against the exact same corruption resurfacing through any other path
// (a stale cached response from before that fix deployed, e.g.).
const normalizeSettings = ( settings ) =>
	settings && ! Array.isArray( settings ) ? settings : {};

/**
 * Slugifies a Label into a field Name -- lowercase, non-alphanumeric
 * runs collapsed to a single underscore, leading/trailing underscores
 * trimmed -- e.g. "True False" -> "true_false", matching the "Lowercase
 * and underscores only" hint the Name input has always shown. Deliberately
 * simpler than `sanitize_text_field()`/whatever `Model_Fields::validate()`
 * ultimately enforces server-side (no accent-folding, no length cap) --
 * this only ever feeds a live, client-side auto-fill a site owner can
 * still freely retype over (see `nameManuallyEditedRef` below), never a
 * value trusted as-is, the same "client hint, server enforces" split
 * every other approximate client-side preview in this app already has
 * (`PermalinkControl`'s own `slugify()`, e.g.).
 */
const slugifyFieldName = ( value ) =>
	String( value ?? '' )
		.toLowerCase()
		.trim()
		.replace( /[^a-z0-9]+/g, '_' )
		.replace( /^_+|_+$/g, '' );

/**
 * A small ACF-style field editor for one model: add a field, edit one in
 * place, delete one -- backed by Gateway\Model_Fields via
 * /gateway/v1/models/<class>/fields. Every field here is a *real* column
 * on the model's own table (see Model_Fields on the PHP side): adding one
 * generates and runs an ADD COLUMN migration, editing one a RENAME/MODIFY
 * COLUMN migration, removing one a DROP COLUMN migration -- so unlike the
 * Title/Plural Title fields on this same page, every action here can fail
 * for real schema reasons (a duplicate or reserved name, an unsupported
 * type) and is reported inline via the same notice area other screens use.
 *
 * **Autosaves -- no Save/Cancel/Done to manage.** The panel's own form
 * state is a single React Hook Form instance (`useForm`), `reset()` to a
 * field's current values (or a blank draft's) whenever editing starts. A
 * `watch()` subscription debounces every value change by
 * `AUTOSAVE_DEBOUNCE_MS` and, once the result actually differs from
 * what's currently saved (`lastSavedRef`) AND is valid enough to submit
 * at all, fires the exact same POST/PUT this used to wait for an
 * explicit Save click to send -- so typing a Label, flipping Required,
 * or reordering a choice just takes effect shortly after you stop, the
 * same way `label`-only edits already ran no migration at all. There is
 * no button anywhere for this any more, not even a "Done": closing a row
 * (clicking it again, or its own row-action "Edit" -- the two toggle the
 * same open/closed state, see handleRowClick/handleEditClick) flushes any
 * still-pending change immediately first, so closing right after typing
 * never drops it, then removes the row entirely if it's a draft that
 * never actually reached a valid, saved state. The other way a change
 * can still be mid-debounce --
 * navigating away from this screen entirely, not closing the row first --
 * is covered too: the debounce effect's own cleanup flushes whatever's
 * still pending (`pendingSaveValuesRef`) rather than just cancelling the
 * timer, so this component unmounting is never a silent way to lose the
 * last few keystrokes.
 *
 * This does mean a field's Name going through several real RENAME COLUMN
 * migrations if someone pauses mid-word while typing it (each pause past
 * the debounce window commits whatever's been typed so far) -- an
 * accepted trade-off for "changes just happen," not something this tries
 * to special-case away by treating Name differently from every other
 * input.
 *
 * **The row never disappears -- the panel opens right underneath it.**
 * Clicking anywhere on a row (except its own grip handle or row-actions,
 * below) opens its own edit panel in a second `<tr>`, not a replacement
 * for the first; clicking the already-open row again collapses it
 * (flushing first, as above); clicking a DIFFERENT row while one is open
 * SWITCHES to it -- closes/flushes whatever's currently open first, then
 * opens the one actually clicked, never two panels open at once. This
 * used to just do nothing at all instead, on the theory that "one
 * editing surface at a time" meant a second click should be ignored the
 * way the old per-row Edit/Delete buttons' own `disabled` attribute
 * enforced it -- but with no `disabled` styling or any other visual
 * sign of that here, a click that silently did nothing just read as
 * broken, not as an intentional constraint (reported as "Edit/Duplicate
 * clicks fail when another field is open"). Duplicate's own row-actions
 * link never had a real reason to be blocked like this at all -- it
 * only ever appends a new row at the very end of `fields`, which can't
 * shift any other row's own index out from under an open edit panel the
 * way, say, deleting an EARLIER row could. The open row's own cells show
 * the LIVE, not-yet-necessarily-saved values (type/label/name) rather
 * than freezing at whatever was last actually saved, so renaming a field
 * is visible on its own row immediately, not up to `AUTOSAVE_DEBOUNCE_MS`
 * later once the request lands.
 *
 * Each row's own leading cell holds two separate controls, both from
 * `lucide-react`: a `GripVertical` handle, visible only on that row's own
 * hover (`.gateway-field-editor-grip`, opacity `0` otherwise) and the
 * ONLY thing `draggable`/reorder-triggering any more (a plain click
 * anywhere else on the row opens/closes it instead, so dragging and
 * opening can't be confused for each other) -- and a `ChevronRight`/
 * `ChevronDown`, always visible, purely indicating open/closed state (it
 * doesn't need its own click handler; the row's own `onClick` already
 * covers the whole row). A small wp-admin-style row-actions menu ("Edit |
 * Duplicate | Delete", plain text links, `.row-actions`) sits directly
 * under the Label cell's own title (`.gateway-field-editor-row-title`),
 * `visibility: hidden` until the row is hovered -- each link calls
 * `event.stopPropagation()` so clicking it doesn't ALSO trigger the
 * row's own open/close click underneath it.
 *
 * **Every row is a fixed, generous height (~60px) with its content
 * TOP-aligned, ACF's own row-editor convention** -- not the more usual
 * "as tall as the content needs, vertically centered" a plain data table
 * would use. This is deliberate, not a compromise: the Label cell's true
 * content is two lines (the title, and the row-actions line right under
 * it, `visibility: hidden` or not), while every other cell (chevron,
 * Name, Type) is one line -- with `vertical-align: middle`, centering is
 * computed against each cell's own full content box, so the visibly
 * shorter cells would center lower than the two-line Label cell's own
 * title line, throwing title/chevron/Name/Type out of alignment with
 * each other despite looking like one row. Top-aligning everything
 * against a shared, fixed row height sidesteps that entirely: as long as
 * every cell gets the same top padding, each one's own FIRST line -- the
 * chevron, the title, Name, Type -- lands at exactly the same y whether
 * or not anything else follows it underneath, so they read as one
 * aligned row regardless of how many lines the Label cell happens to
 * carry below its own title.
 *
 * `editingIndex` (an index into `fields`, not a name -- a draft has no
 * name yet to key off of) tracks which single row is open; `isNewDraft`
 * is what actually differs between a brand new field and an existing one
 * (POST vs. PUT, and whether closing with nothing ever saved removes the
 * row). Because autosave can flip a draft into "saved" mid-session (the
 * moment its first valid save succeeds), `isNewDraftRef`/`editOriginalNameRef`
 * mirror that state into refs the autosave chain itself reads -- reading
 * the plain state variables there would risk seeing a stale value from
 * before React re-renders. Every autosave attempt (the debounce timer, or
 * a row-close flushing one immediately) is chained through `saveChainRef`
 * rather than fired independently, so two attempts arriving close
 * together (e.g. closing a row right as a debounced save is still in
 * flight) run strictly one after another instead of racing -- the second
 * one always sees the first one's now-current `isNewDraftRef`/
 * `lastSavedRef`, never a stale snapshot from before it finished.
 *
 * Label is the one field-level thing here that *isn't* a schema change --
 * it's a plain display string (shown in place of the raw name wherever a
 * field is rendered for a human, e.g. RecordForm/RecordsCrud), so editing
 * it alone never runs a migration. Left blank, the server derives one
 * from the name automatically (e.g. "first_name" -> "First Name").
 *
 * Fields are a sortable list -- drag a row (anywhere on it, not just its
 * leading chevron cell) to reorder it, via native HTML5 drag-and-drop
 * rather than a library, and the same "reorder is metadata-only" reasoning
 * as label: PUT .../fields-order takes the whole new name order and never
 * runs a migration either (Gateway\Model_Fields::reorder()). The drop
 * updates local state immediately (so the list doesn't visually snap
 * back while the request is in flight) and reverts it if the request
 * fails. Disabled the whole time any row is open for editing/adding --
 * there's nothing meaningful to drop a row onto while its own name/
 * position is still unsettled.
 *
 * The Type picker (`TypeSelect.jsx`, a searchable popover grouped by
 * category -- ACF's own "Add Field" picker's layout, `Basic`/`Content`/
 * `Choice`/`Relational`/`Advanced`/`Layout`) is built from useFieldTypes()
 * (Gateway\Field_Type_Registry, via GET /field-types) rather than a
 * hardcoded list here, so a future field type shows up automatically,
 * filed under whichever category its own `Field_Type::category()`
 * names.
 *
 * "Relate to One"/"Relate to Many" (Relate_To_One_Field_Type/Relate_To_Many_
 * Field_Type) are special-cased throughout: each one's `relationship_type`
 * (from useFieldTypes(), null for every other type) says which of this
 * model's own belongsTo/belongsToMany relationships it can attach to.
 * Picking one of these types swaps the free-text Name input out for a
 * dropdown of this model's matching-type relationships -- there's nothing
 * meaningful to type a name in for one of these, since Model_Fields::add()
 * derives the real column/field name itself from the relationship (e.g.
 * a "make" belongsTo becomes a "make_id" field) -- and the request sends
 * `relationship_method` instead of `name`. Matching the server-side
 * immutability guard (a relate field's relationship can't be changed once
 * created), editing an EXISTING one of these disables the Name and Type
 * inputs -- only its Label (and Validation/Choices) stay editable, same
 * as every other field type.
 *
 * Four tabs, always all present, mirroring ACF's own field-settings
 * layout: **General** (Type/Label/Name, in that order -- Type comes
 * FIRST: picking it before typing a Label/Name/Default Value is both the
 * more natural order for a site owner filling this out top to bottom,
 * and what those other inputs' own type-dependent rendering (the
 * relationship picker in place of Name for a relate type, the Default
 * Value input switching between text/number/a choices `<select>` further
 * below) already implicitly assumes. Label comes before Name -- not
 * Name before Label -- per a direct request, "copy how ACF handles it":
 * Name auto-fills from Label as it's typed (`slugifyFieldName()`,
 * lowercase with underscores -- "True False" becomes "true_false") for
 * as long as Name hasn't been touched by hand yet
 * (`nameManuallyEditedRef`, reset to "not yet touched" only when
 * `handleStartAdd()` starts a brand new, still-unsaved draft; an
 * already-EXISTING field's own Name is a real column, so `startEdit()`
 * marks it "already touched" immediately, permanently skipping this
 * sync -- retyping a saved field's own Label should never silently
 * rename its column out from under it). The moment a site owner types
 * into Name directly, that sync ends for the rest of this add/edit
 * session, however Name ends up looking from there -- the same "one
 * manual edit ends it for good" behavior ACF's own field editor has.
 * Directly under Name, when
 * the picked type's own `supports_default_value` is true AND it has no
 * choices list of its own -- Text, Number, Range, Email, URL today -- a
 * plain Default Value text/number input, applied by `RecordForm` as the
 * initial value of its own "Add New" form and nowhere else, with its own
 * small "Appears when creating a new record." note underneath. For one
 * of the four Choice types instead (per a direct request: "all of the
 * choices field types need to have default value option... the default
 * can be either none or one of the choices chosen from a select") --
 * Buttons/Select/Radio/Checkbox -- that same Default Value control is
 * deliberately placed AFTER the Choices list further below, not here
 * under Label: reported directly, "default value placement needs to be
 * AFTER choices because the user needs to add choices first," since it
 * renders as a `<select>` built from those very choices and is useless
 * (nothing to pick) before at least one exists. That `<select>` offers
 * "— None —" plus every one of `editChoices`' own CURRENT, live,
 * non-blank rows (already watched at the top of this component, the
 * exact same `choices` state `ChoicesEditor` itself is bound to, so
 * adding/renaming/removing a choice updates this list immediately, with
 * no separate fetch or sync of its own) -- so a default can only ever be
 * "none," or one of the choices actually offered right now, never a
 * stray, mistyped value; the server's own generic `sanitize_settings()`
 * trims/stores whatever string `settings.default` holds either way, the
 * same tolerant treatment Number's own default (never validated as truly
 * numeric) already gets, so a default that later goes stale (its own
 * choice renamed/removed) is left as-is rather than actively scrubbed,
 * same "tolerate staleness gracefully" precedent `RecordsCrud`'s own
 * already-saved-value display already has. Image and File are the two
 * types whose General tab looks different again -- no Default Value at
 * all for either (`supports_default_value` false; there's no sensible
 * "default attachment" for a brand new record to start from),
 * but, gated on the picked type's own `supports_media_settings`
 * (Image)/`supports_file_settings` (File) instead, a Return Format
 * `<select>` sharing the same three underlying values and the same
 * `settings.return_format` field either way, just labeled differently
 * per type (Image Array/Image URL/Image ID vs. File Array/File URL/File
 * ID) -- what shape `Records_REST_Controller::resolve_image_value()`/
 * `resolve_file_value()` gives this field's own value in every GET
 * response). oEmbed's own General tab (`supports_embed_settings`) is a
 * fourth shape again -- also no Default Value, but an "Embed Size" row
 * (`settings.embed_width`/`embed_height`, both in px, both independently
 * optional -- a plain `<div>` wrapper here too, not `<label>`, same
 * reasoning as the Type field's own wrapper: two `<input>`s means two
 * labelable descendants for a real `<label>` to get confused about)
 * feeding `OEmbedPicker`'s own `maxwidth`/`maxheight` request to
 * WordPress's oEmbed proxy. User's own General tab (`supports_user_settings`)
 * is a fifth shape, and the plainest of the three Return Format variants
 * -- also no Default Value, and the SAME shared `<select>`/`settings.return_format`
 * field as Image/File, just narrowed to two options (User Array/User
 * ID, never a "User URL" -- see `Field_Type::supports_user_settings()`'s
 * own docblock for why) feeding `Records_REST_Controller::resolve_user_value()`
 * instead; Permalink's own General tab (`supports_permalink_settings`) is
 * a sixth shape again -- also no Default Value, but a **Source Field**
 * `<select>` (`settings.source_field`) built from this model's OTHER
 * fields, filtered client-side to `is_text_renderable` -- the exact
 * eligibility `Model_Fields::validate_permalink_settings()` enforces
 * server-side, mirrored here so an ineligible field is never even offered
 * -- plus a plain note pointing at the separate **Permalinks** tab
 * (`PermalinkEditor.jsx`, on `ModelDetail`) for the URL root and template
 * page, which aren't per-field settings at all (Root is validated for
 * cross-model uniqueness, so it belongs with the rest of that
 * model-level configuration, not buried in one field's own panel). The
 * Type picker (`TypeSelect.jsx`) also greys out "Permalink" once this
 * model already has one on some OTHER field (`disabledTypeKeys`, computed
 * from `Field_Type::max_one_per_model()` -- see that component's own
 * docblock) -- a client-side nicety on top of the same rejection
 * `Model_Fields::add()`/`update()` already enforce server-side; plus --
 * further below, never a tab of its own -- a ChoicesEditor for the
 * field's own orderable choice list, Gateway\\Model_Field_Choices on the
 * server, shown only when the picked type's own `has_choices` is true,
 * immediately followed, inside that same block, by the choices-`<select>`
 * Default Value control described above -- placed there and nowhere else
 * so a site owner always has a real choice list to pick a default from
 * before being asked to pick one),
 * then **Validation** (a "Required" toggle, Gateway\\Model_Fields::
 * validate_required_fields() on the server -- applies to every field
 * regardless of type; plus, when the picked type's own
 * `supports_character_limit` is true -- Text and Text Area only, today --
 * a Character Limit number input with its own small "Leave blank for no
 * limit." note underneath, actually enforced server-side by
 * Gateway\\Model_Fields::validate_character_limits(); plus, when the
 * picked type's own `supports_range_limits` is true -- Range only,
 * today -- Minimum Value/Maximum Value number inputs, each independently
 * optional ("Leave blank for no minimum/maximum." notes underneath),
 * actually enforced server-side by Gateway\\Model_Fields::
 * validate_range_values() -- neither of these two is just recorded);
 * Image's own Validation tab is a fifth, unrelated shape gated on its
 * own `supports_media_settings` flag: a Minimum/Maximum grid
 * (`.gateway-field-editor-media-bounds-row`, two columns) each with
 * Width/Height/File Size rows laid out as a prepend-label/`<input>`/
 * append-unit group (`Width`/px, `Height`/px, `File Size`/MB --
 * `settings.min_width`/`max_width`/`min_height`/`max_height`/`min_size`/
 * `max_size`, all independently optional) plus a free-text Allowed File
 * Types input (`settings.allowed_types`, a comma/space-separated
 * extension list, e.g. "jpg,png"). File's own Validation tab (gated on
 * `supports_file_settings` instead) is the same shape minus the
 * Width/Height rows -- just a Minimum/Maximum File Size pair (the exact
 * same `settings.min_size`/`max_size` keys Image's own bundle already
 * uses) plus its own Allowed File Types input (e.g. "pdf,docx,zip"). All
 * of these are enforced server-side by the same `Gateway\\Model_Fields::
 * validate_attachment_constraints()` regardless of which of the two
 * types is active, the same "client hint, server enforces" split
 * Character Limit/Range already have, and mirrored client-side again by
 * `ImagePicker.jsx`'s/`FilePicker.jsx`'s own `validateAttachment()` for
 * an immediate rejection at pick time rather than waiting on a failed
 * save,
 * then **Presentation** (one `<input>`/`<textarea>`/`<select>`
 * per key in the picked type's own `presentation_fields` -- see
 * `PRESENTATION_FIELD_META` above, and `Field_Type::presentation_fields()`'s
 * own docblock on the PHP side for the whole "different types need
 * different extra data" design this is the first real use of --
 * `instructions` is universal, always first, for every type; Text,
 * Number, Email, and Password also recognize Placeholder (URL recognizes
 * Placeholder too, but not Prepend/Append -- see Url_Field_Type's own
 * docblock for why a prepended/appended URL doesn't make sense the way
 * it does for the others), and Text/Number/Range/Email/Password all
 * recognize Prepend/Append (Number and Range also get their own `step`,
 * a plain number input rendered via `PRESENTATION_FIELD_META`'s own
 * `type: 'number'`, right after Placeholder for Number -- Range has no
 * Placeholder at all, a slider always has a value and no empty state to
 * hint at, so `step` renders right after Instructions for it instead --
 * the order a type's own `presentation_fields` lists a key in is the
 * order this tab renders it in); Image recognizes Preview Size instead
 * of any of the above (`settings.preview_size`, a `<select>` -- see
 * `PRESENTATION_FIELD_META`'s own comment on why its options come from
 * `useImageSizes()` at render time rather than living in that static
 * catalog -- which of this site's registered image sizes, e.g. "Medium
 * (300×300)", `ImagePicker.jsx`'s own preview renders at); every other
 * type recognizes `instructions` alone), and **Conditional Logic** -- a "Conditional Logic" toggle
 * (`conditional_logic.enabled`, its own separate RHF field, NOT part of
 * the `settings` object the other three tabs share -- this one is a
 * genuinely nested tree, not a flat set of strings, so
 * `Gateway\\Model_Fields` gives it its own `gateway_fields.conditional_logic`
 * column entirely) and, once switched on, a `ConditionalLogicEditor`
 * (`admin-app/src/components/ConditionalLogicEditor.jsx`) for building
 * "Show this field if ..." -- OR'd groups of AND'd `{field, operator,
 * value}` rules, `field` limited to this model's OTHER already-saved
 * fields (never this one -- a field can't meaningfully condition on
 * itself), `operator` one of Has any value/Has no value/Value is equal
 * to/Value is not equal to/Value contains. Switching the toggle on with
 * no rules configured yet seeds one blank rule immediately, so the
 * builder is never shown genuinely empty. Applies uniformly regardless
 * of type, like Required -- there's no `Field_Type` method gating which
 * types get to have this. Actually enforced, not just recorded:
 * `Gateway\\Model_Fields::validate_required_fields()`/
 * `validate_character_limits()` both skip a field entirely -- required or
 * character-limited or not -- the moment its own Conditional Logic
 * evaluates to "hidden" for the record being saved, treating it as if
 * that field doesn't exist for that record at all; `RecordForm`'s own
 * client-side evaluation (see that component's own docblock) is what
 * actually hides the field's own input in the UI to begin with.
 *
 * Default Value, Character Limit, Minimum/Maximum Value, and every
 * Presentation setting all live in the SAME `settings` object/RHF field
 * (`settings.default`/`settings.character_limit`/`settings.min_value`/
 * `max_value` alongside `settings.placeholder`/etc.) --
 * `Field_Type::supports_default_value()`/`supports_character_limit()`/
 * `supports_range_limits()` and `presentation_fields()` are what keep
 * them from being confused for each other despite sharing one object:
 * which tab's dot lights up for a given key (General/Validation/
 * Presentation, see `generalTabHasContent`/`validationTabHasContent`/
 * `presentationTabHasContent` below) is decided by which of those
 * methods actually recognizes it, not by where the value happens to
 * live. A small green dot on a tab's own heading (General/Validation/
 * Presentation/Conditional Logic) marks that it currently holds real
 * content (a non-blank choice or Default Value; Required switched on
 * and/or a configured Character Limit and/or a configured Minimum/
 * Maximum Value; a non-blank presentation setting; Conditional Logic
 * switched on with at least one rule that actually has a field picked)
 * -- based on the live, already-autosaved values, not a "changed since
 * this session started" diff, so it's still showing the next time this
 * same field is opened for editing, not just while it's being actively
 * typed into.
 *
 * "Buttons"/"Select"/"Radio"/"Checkbox" (any Choice_Field_Type -- each
 * type's own `has_choices` from useFieldTypes()) are the one case where
 * General's own inline Choices section is more than absent: reordering,
 * adding, or removing a choice is a normal in-place (auto-saved) edit
 * here, the same as a renamed field or a changed label is -- there's no
 * "immutable once created" rule for choices the way there is for a
 * relate field's own relationship (above).
 */
export default function FieldEditor( { modelClass, fields, onFieldsChange, relationships = [] } ) {
	const fieldTypes = useFieldTypes();
	const relationshipTypes = useRelationshipTypes();
	const imageSizes = useImageSizes();
	const setFields = onFieldsChange;
	const [ error, setError ] = useState( '' );
	const [ justSaved, setJustSaved ] = useState( false );

	// The single row currently open for editing OR adding, by its index
	// in `fields` (not by name -- a not-yet-saved draft has none yet).
	// `null` means nothing is open.
	const [ editingIndex, setEditingIndex ] = useState( null );
	const [ isNewDraft, setIsNewDraft ] = useState( false );
	const [ editOriginalName, setEditOriginalName ] = useState( '' );
	const [ savingEdit, setSavingEdit ] = useState( false );

	// Mirrors of the state above the autosave chain itself reads -- see
	// this component's own docblock for why plain state isn't safe there.
	const isNewDraftRef = useRef( false );
	const editOriginalNameRef = useRef( '' );
	const lastSavedRef = useRef( null );
	// Every autosave attempt -- whether from the debounce timer below or
	// from finishEditing() flushing a last change when a row closes --
	// chains onto this instead of firing independently, so two attempts
	// arriving close together run strictly one after another (each seeing
	// the OTHER's now-current isNewDraftRef/lastSavedRef) rather than
	// racing: without this, closing a row right as a debounced save was
	// still in flight could see stale isNewDraftRef.current, wrongly
	// conclude a request that's actually about to succeed never happened,
	// and delete the row out from under it.
	const saveChainRef = useRef( Promise.resolve() );
	const debounceTimerRef = useRef( null );
	// The values the debounce timer above is currently waiting to save, if
	// any -- null whenever nothing is pending (no change since the last
	// save, or the pending one already fired). Needed so the debounce
	// effect's own cleanup (see its own comment below) can flush a change
	// that's still mid-wait when this component unmounts out from under
	// it -- navigating away entirely (not closing the row, which already
	// flushes via finishEditing()) -- instead of just cancelling it.
	const pendingSaveValuesRef = useRef( null );
	const savedFlashTimerRef = useRef( null );
	// ACF-style "Name auto-fills from Label until you type into Name
	// yourself" -- per a direct request ("in our field create/edit forms
	// put the label first and the name of the field after, and have name
	// slugify the title... this copies how ACF handles it"). `false` only
	// while adding a brand NEW, still-unsaved field (handleStartAdd resets
	// it) -- editing an EXISTING field always starts `true` (startEdit sets
	// it), so retyping a saved field's own Label never silently renames its
	// real column out from under it the way it does for a draft that has no
	// column yet to protect. Flipped to `true` the moment the Name input's
	// own onChange fires at all (even if the user clears it back to blank),
	// same "one manual edit ends the sync for good, however it plays out
	// from there" behavior ACF's own field editor has.
	const nameManuallyEditedRef = useRef( false );

	const {
		control,
		register,
		watch,
		reset,
		getValues,
		setValue,
	} = useForm( {
		defaultValues: {
			name: '',
			label: '',
			type: 'text',
			relationshipMethod: '',
			choices: [],
			required: false,
			settings: {},
			conditional_logic: { enabled: false, groups: [] },
		},
	} );

	const watched = watch();
	const editName = watched.name;
	const editLabel = watched.label;
	const editType = watched.type;
	const editRelationshipMethod = watched.relationshipMethod;
	const editChoices = watched.choices;
	const editRequired = watched.required;
	const editSettings = watched.settings || {};
	const editConditionalLogic =
		watched.conditional_logic || { enabled: false, groups: [] };

	const [ editTab, setEditTab ] = useState( 'general' );

	const [ deletingName, setDeletingName ] = useState( null );

	const [ draggedName, setDraggedName ] = useState( null );
	const [ reordering, setReordering ] = useState( false );

	const basePath = `/models/${ encodeURIComponent( modelClass ) }/fields`;
	const dragEnabled = null === editingIndex && null === deletingName;

	// `relationships` (this model's own) arrives as a prop, owned by
	// ModelDetail and shared with RelationshipEditor -- not fetched here
	// independently. It used to be: FieldEditor fetched its own copy once
	// on mount, so adding a relationship via RelationshipEditor (its own
	// tab on the same page) never updated it, leaving the "Relate to
	// One"/"Relate to Many" picker here falsely reporting "No <type>
	// relationships yet" even though one genuinely existed. Sharing one
	// lifted-up state closes that gap entirely -- see ModelDetail's own
	// docblock.

	const relationshipTypeFor = ( typeKey ) =>
		fieldTypes.find( ( type ) => type.key === typeKey )?.relationship_type ||
		null;

	const relationshipTypeLabel = ( key ) =>
		relationshipTypes.find( ( type ) => type.key === key )?.label || key;

	const hasChoicesFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.has_choices );

	const presentationFieldsFor = ( typeKey ) =>
		fieldTypes.find( ( type ) => type.key === typeKey )?.presentation_fields || [];

	const supportsDefaultFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_default_value );

	const supportsCharacterLimitFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_character_limit );

	const supportsRangeLimitsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_range_limits );

	const supportsMediaSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_media_settings );

	const supportsFileSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_file_settings );

	const supportsEmbedSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_embed_settings );

	const supportsUserSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_user_settings );

	const supportsPermalinkSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_permalink_settings );

	const supportsBooleanSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_boolean_settings );

	const supportsLinkSettingsFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.supports_link_settings );

	const isTextRenderableFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.is_text_renderable );

	const isMultipleFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.is_multiple );

	const maxOnePerModelFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.max_one_per_model );

	const editRelationshipType = relationshipTypeFor( editType );
	const editHasChoices = hasChoicesFor( editType );
	const editPresentationFields = presentationFieldsFor( editType );
	const editSupportsDefault = supportsDefaultFor( editType );
	const editSupportsCharacterLimit = supportsCharacterLimitFor( editType );
	const editSupportsRangeLimits = supportsRangeLimitsFor( editType );
	const editSupportsMediaSettings = supportsMediaSettingsFor( editType );
	const editSupportsFileSettings = supportsFileSettingsFor( editType );
	const editSupportsEmbedSettings = supportsEmbedSettingsFor( editType );
	const editSupportsUserSettings = supportsUserSettingsFor( editType );
	const editSupportsPermalinkSettings = supportsPermalinkSettingsFor( editType );
	const editSupportsBooleanSettings = supportsBooleanSettingsFor( editType );
	const editSupportsLinkSettings = supportsLinkSettingsFor( editType );
	const editIsMultiple = isMultipleFor( editType );
	const matchingRelationships = editRelationshipType
		? relationships.filter(
				( relationship ) => relationship.type === editRelationshipType
		  )
		: [];

	// The field this edit session started from -- unset for a draft (it
	// never came from `fields` in the first place). Its (unchanging)
	// *original* type is what decides whether Name/Type stay locked --
	// otherwise picking a different type mid-edit would retroactively
	// unlock inputs a relate field's own immutability rule never actually
	// allows changing.
	const editingOriginalField =
		! isNewDraft && null !== editingIndex ? fields[ editingIndex ] : null;
	const editingIsRelate = editingOriginalField
		? Boolean( relationshipTypeFor( editingOriginalField.type ) )
		: false;

	// Every OTHER field on this model -- a field can never meaningfully
	// condition on its own value, so whichever row is currently open
	// (by index, not name -- a still-unsaved draft has no name yet to
	// exclude by) is left out of what ConditionalLogicEditor's own Field
	// dropdown offers. Only already-saved fields are ever real options
	// here; a brand new draft isn't itself referenceable by anything yet
	// either, consistent with that.
	const conditionalLogicOtherFields = fields
		.filter( ( _field, index ) => index !== editingIndex )
		.map( ( field ) => ( { name: field.name, label: field.label || field.name } ) );

	// Permalink's own Source Field dropdown -- same "every OTHER field"
	// exclusion as Conditional Logic above (a permalink can't slugify
	// itself), further narrowed to whichever of those are
	// is_text_renderable() -- the exact eligibility
	// Model_Fields::validate_permalink_settings() enforces server-side,
	// mirrored here client-side so an ineligible field is never even
	// offered rather than being picked and only rejected once autosave
	// actually runs.
	const permalinkSourceFieldOptions = fields
		.filter( ( _field, index ) => index !== editingIndex )
		.filter( ( field ) => isTextRenderableFor( field.type ) )
		.map( ( field ) => ( { name: field.name, label: field.label || field.name } ) );

	// The Type picker's own client-side echo of Model_Fields::add()/
	// update()'s server-side max_one_per_model() rejection -- see
	// TypeSelect.jsx's own docblock on `disabledKeys` for the full
	// reasoning. A type counts as "already in use" only via some OTHER
	// field (by index, not name -- a still-unsaved draft has none yet to
	// exclude by, same reasoning conditionalLogicOtherFields/
	// permalinkSourceFieldOptions already use), so re-opening the one
	// field that IS a Permalink and leaving its own type alone is never
	// blocked.
	const disabledTypeKeys = fieldTypes
		.filter( ( type ) => maxOnePerModelFor( type.key ) )
		.filter( ( type ) =>
			fields.some(
				( field, index ) => index !== editingIndex && field.type === type.key
			)
		)
		.map( ( type ) => type.key );

	// A tab's own dot reflects whether it currently holds real content --
	// the live (already-autosaved-or-about-to-be) values, not a diff
	// against this session's own starting point, so it's still showing
	// the next time this field is reopened for editing, not just while
	// it's being actively typed into.
	//
	// General's own dot covers both things that can live there: inline
	// Choices, and (like Choices, only for a type that recognizes it) a
	// Default Value -- `settings.default`, checked directly rather than
	// via `Object.values( editSettings )` (see presentationTabHasContent
	// below for why that broader check would wrongly light up a tab this
	// value doesn't actually belong to).
	const choicesTabHasContent = editChoices.some( ( choice ) => choice.value.trim() );
	// Checkbox's own default is an array (several can be checked at
	// once, see this component's own docblock) -- `[]` is truthy in
	// JS, so the plain `Boolean( x && ... )` every other settings
	// check here uses would wrongly light up this dot for an empty
	// selection; checked by length instead, only for the array case.
	const defaultValueTabHasContent = Array.isArray( editSettings.default )
		? editSettings.default.length > 0
		: Boolean( editSettings.default && String( editSettings.default ).trim() );
	const permalinkSourceFieldTabHasContent = Boolean(
		editSettings.source_field && String( editSettings.source_field ).trim()
	);
	// True_False_Field_Type's own General-tab setting (see
	// supports_boolean_settings()'s own docblock) -- 'show_toggle' is
	// deliberately NOT checked here, even though it also lives in
	// `editSettings`: it's a Presentation-tab setting for this type, not
	// General's, the same "checked by key name, only for the tab it
	// actually belongs to" reasoning presentationTabHasContent below
	// already applies.
	const messageTabHasContent = Boolean(
		editSettings.message && String( editSettings.message ).trim()
	);
	const generalTabHasContent =
		choicesTabHasContent ||
		defaultValueTabHasContent ||
		permalinkSourceFieldTabHasContent ||
		messageTabHasContent;
	// Validation's own dot covers everything that can live there:
	// Required, a configured Character Limit, and a configured Minimum/
	// Maximum Value (each checked directly for the same reason Default
	// Value is above).
	const characterLimitTabHasContent = Boolean(
		editSettings.character_limit && String( editSettings.character_limit ).trim()
	);
	const rangeLimitsTabHasContent = Boolean(
		( editSettings.min_value && String( editSettings.min_value ).trim() ) ||
			( editSettings.max_value && String( editSettings.max_value ).trim() )
	);
	// Covers both Image's own bundle (width/height/size) and File's own
	// narrower one (just size) -- checked by key name, not gated on
	// editSupportsMediaSettings/editSupportsFileSettings, the same
	// "doesn't need to know which type is active" reasoning
	// rangeLimitsTabHasContent already has for min_value/max_value: a
	// File field's settings simply never carry min_width/etc. in the
	// first place, so those keys are always blank for it regardless.
	const mediaValidationTabHasContent = Boolean(
		[ 'min_width', 'min_height', 'min_size', 'max_width', 'max_height', 'max_size', 'allowed_types' ].some(
			( key ) => editSettings[ key ] && String( editSettings[ key ] ).trim()
		)
	);
	const validationTabHasContent =
		Boolean( editRequired ) ||
		characterLimitTabHasContent ||
		rangeLimitsTabHasContent ||
		mediaValidationTabHasContent;
	// Checked only against the current type's OWN presentation keys, not
	// every key `editSettings` happens to hold -- `settings.default`
	// lives in the same object but belongs to General, not here, so a
	// blanket `Object.values( editSettings )` scan would wrongly light up
	// this tab's dot for a Default Value someone set with nothing actually
	// filled in on the Presentation tab itself.
	const presentationTabHasContent =
		editPresentationFields.some(
			( key ) => editSettings[ key ] && String( editSettings[ key ] ).trim()
		) ||
		// 'show_toggle' isn't one of `editPresentationFields` (it's not
		// a generic `presentation_fields()` key -- see
		// `supports_boolean_settings()`'s own docblock), but it still
		// renders on this tab, so it still needs to count toward this
		// tab's own dot.
		Boolean( editSettings.show_toggle && String( editSettings.show_toggle ).trim() );

	// "Has real content" here means at least one rule with a field
	// actually picked -- an enabled toggle with nothing configured yet
	// (the state right after switching it on, before a first field is
	// even chosen) doesn't count as content worth flagging.
	const conditionalLogicTabHasContent =
		Boolean( editConditionalLogic.enabled ) &&
		( editConditionalLogic.groups || [] ).some( ( group ) =>
			( group.rules || [] ).some( ( rule ) => rule.field )
		);

	// Choices are `{value, label}` pairs, not plain strings -- compared
	// field-by-field rather than with a bare `===` (which would always be
	// false for two structurally-identical-but-distinct objects).
	const choicesEqual = ( a, b ) =>
		a.length === b.length &&
		a.every(
			( choice, index ) =>
				choice.value === b[ index ].value && choice.label === b[ index ].label
		);

	const settingsEqual = ( a, b ) => {
		const aKeys = Object.keys( a || {} );
		const bKeys = Object.keys( b || {} );

		return (
			aKeys.length === bKeys.length &&
			aKeys.every( ( key ) => ( a || {} )[ key ] === ( b || {} )[ key ] )
		);
	};

	// Conditional logic is a nested tree (groups of rules), not a flat
	// set of keys the way `settings` is -- JSON.stringify()'d comparison
	// is a pragmatic stand-in for a real deep-equal here, safe because
	// this component is the only thing that ever constructs this shape
	// (a stable, consistent key order every time), not arbitrary JSON
	// from somewhere else that could reorder keys and produce a false
	// "changed" reading.
	const conditionalLogicEqual = ( a, b ) =>
		JSON.stringify( a || {} ) === JSON.stringify( b || {} );

	const snapshotsEqual = ( a, b ) =>
		null !== a &&
		null !== b &&
		a.name === b.name &&
		a.label === b.label &&
		a.type === b.type &&
		a.relationshipMethod === b.relationshipMethod &&
		a.required === b.required &&
		choicesEqual( a.choices, b.choices ) &&
		settingsEqual( a.settings, b.settings ) &&
		conditionalLogicEqual( a.conditional_logic, b.conditional_logic );

	const isValidToSaveValues = ( values ) => {
		const relationshipType = relationshipTypeFor( values.type );

		const nameOk = relationshipType
			? Boolean( values.relationshipMethod )
			: Boolean( values.name.trim() );

		const choicesOk =
			! hasChoicesFor( values.type ) ||
			values.choices.filter( ( choice ) => choice.value.trim() ).length > 0;

		return nameOk && choicesOk;
	};

	const buildBody = ( values ) => {
		const relationshipType = relationshipTypeFor( values.type );

		const body = relationshipType
			? {
					relationship_method: values.relationshipMethod,
					type: values.type,
					label: values.label,
			  }
			: { name: values.name, label: values.label, type: values.type };

		// Required applies uniformly, unlike choices -- always sent,
		// never gated on what the picked type actually is.
		body.required = values.required;

		if ( hasChoicesFor( values.type ) ) {
			body.choices = values.choices;
		}

		// Same reasoning as required -- always sent, regardless of type.
		// Model_Fields::sanitize_settings() is what actually filters this
		// down to whatever the picked type recognizes; sending everything
		// currently in form state (leftover values from a type this
		// session briefly picked and moved on from, say) is harmless,
		// never stored for a type that doesn't recognize a given key.
		// normalizeSettings() (not a bare `|| {}`), for the same reason
		// `startEdit()` needs it -- see that helper's own docblock: an
		// array here would silently lose every property except numeric
		// ones the instant this gets `JSON.stringify()`'d below.
		body.settings = normalizeSettings( values.settings );

		// Same again -- always sent regardless of type (unlike choices);
		// Model_Fields::sanitize_conditional_logic() is what actually
		// filters a rule referencing an unknown field/operator back out.
		body.conditional_logic = values.conditional_logic || {
			enabled: false,
			groups: [],
		};

		return body;
	};

	// Whenever the picked type changes, default (or clear) the
	// relationship dropdown to match -- a relationship chosen for a
	// different type no longer makes sense once the type itself has
	// changed. Preserves an already-valid current selection rather than
	// always jumping to the first match, so opening an existing relate
	// field's own edit panel (whose relationship was set long before this
	// specific effect run) doesn't get silently reassigned out from under
	// it.
	useEffect( () => {
		if ( null === editingIndex ) {
			return;
		}

		if ( ! editRelationshipType ) {
			setValue( 'relationshipMethod', '' );
			return;
		}

		const matches = relationships.filter(
			( relationship ) => relationship.type === editRelationshipType
		);

		if ( ! matches.some( ( relationship ) => relationship.method_name === editRelationshipMethod ) ) {
			setValue( 'relationshipMethod', matches[ 0 ] ? matches[ 0 ].method_name : '' );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editType, relationships, editingIndex ] );

	// ACF-style Name auto-fill from Label -- see `nameManuallyEditedRef`'s
	// own comment above for the full "until you type into Name yourself,
	// and never at all for an already-existing field" rule this enforces.
	// Skipped entirely for a relate type too: Name isn't even a real text
	// input there (a relationship-method `<select>` takes its place, see
	// the General tab's own JSX below), so there's nothing of this editor's
	// own to keep in sync with Label in the first place.
	useEffect( () => {
		if (
			null === editingIndex ||
			nameManuallyEditedRef.current ||
			editRelationshipType
		) {
			return;
		}

		setValue( 'name', slugifyFieldName( editLabel ) );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editLabel, editRelationshipType, editingIndex ] );

	const flashSaved = () => {
		clearTimeout( savedFlashTimerRef.current );
		setJustSaved( true );
		savedFlashTimerRef.current = setTimeout( () => setJustSaved( false ), 1500 );
	};

	// The autosave chain itself -- see this component's own docblock, and
	// saveChainRef's own comment above, for why isNewDraftRef/
	// editOriginalNameRef (not the plain state) are what this reads and
	// writes, and why every call chains onto saveChainRef rather than
	// running independently.
	const attemptAutosave = ( values, targetIndex ) => {
		const run = async () => {
			if ( ! isValidToSaveValues( values ) ) {
				return;
			}

			if ( snapshotsEqual( values, lastSavedRef.current ) ) {
				return;
			}

			setSavingEdit( true );

			try {
				const body = buildBody( values );

				const savedField = isNewDraftRef.current
					? await apiFetch( basePath, {
							method: 'POST',
							body: JSON.stringify( body ),
					  } )
					: await apiFetch(
							`${ basePath }/${ encodeURIComponent( editOriginalNameRef.current ) }`,
							{
								method: 'PUT',
								body: JSON.stringify( body ),
							}
					  );

				lastSavedRef.current = values;
				isNewDraftRef.current = false;
				setIsNewDraft( false );
				editOriginalNameRef.current = savedField.name;
				setEditOriginalName( savedField.name );

				setFields( ( current ) =>
					current.map( ( existing, i ) =>
						i === targetIndex ? savedField : existing
					)
				);
				setError( '' );
				flashSaved();
			} catch ( err ) {
				setError( err.message );
			} finally {
				setSavingEdit( false );
			}
		};

		// Chained via .then() with the SAME handler on both success and
		// failure paths -- one save attempt failing (e.g. a transient
		// network error) must never permanently wedge every later one
		// behind a rejected promise.
		saveChainRef.current = saveChainRef.current.then( run, run );

		return saveChainRef.current;
	};

	// Debounces every form value change -- resubscribed whenever
	// `editingIndex` changes so each subscription's own closure captures
	// the right target row index (see attemptAutosave's own `targetIndex`
	// param).
	useEffect( () => {
		if ( null === editingIndex ) {
			return;
		}

		const subscription = watch( ( values ) => {
			clearTimeout( debounceTimerRef.current );
			pendingSaveValuesRef.current = values;
			debounceTimerRef.current = setTimeout( () => {
				pendingSaveValuesRef.current = null;
				attemptAutosave( values, editingIndex );
			}, AUTOSAVE_DEBOUNCE_MS );
		} );

		return () => {
			subscription.unsubscribe();
			clearTimeout( debounceTimerRef.current );

			// A change still mid-debounce when this runs is only ever one
			// this component is about to lose for good -- editingIndex only
			// ever goes from non-null to null via finishEditing() (which
			// clears debounceTimerRef and flushes on its own, see below),
			// so the one other way this cleanup fires with something still
			// pending is the component unmounting entirely: the user
			// navigated elsewhere with a change not yet auto-saved. Flush
			// it now rather than silently dropping it.
			if ( pendingSaveValuesRef.current ) {
				const values = pendingSaveValuesRef.current;
				pendingSaveValuesRef.current = null;
				attemptAutosave( values, editingIndex );
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ watch, editingIndex ] );

	const relationshipOptionLabel = ( relationship ) =>
		`${ relationship.related_model } (${ relationship.method_name }())`;

	const handleStartAdd = () => {
		if ( null !== editingIndex ) {
			return;
		}

		setError( '' );
		setFields( ( current ) => [
			...current,
			{
				name: '',
				label: '',
				type: 'text',
				relationship_method: null,
				related_model: null,
				choices: [],
				required: false,
				settings: {},
				conditional_logic: null,
			},
		] );

		const defaults = {
			name: '',
			label: '',
			type: 'text',
			relationshipMethod: '',
			choices: [],
			required: false,
			settings: {},
			conditional_logic: { enabled: false, groups: [] },
		};
		reset( defaults );
		lastSavedRef.current = null; // nothing saved yet at all -- anything valid should autosave.
		isNewDraftRef.current = true;
		editOriginalNameRef.current = '';
		nameManuallyEditedRef.current = false; // a brand new draft: Name starts synced to Label.

		setEditingIndex( fields.length );
		setIsNewDraft( true );
		setEditOriginalName( '' );
		setEditTab( 'general' );
	};

	const startEdit = ( field, index ) => {
		setError( '' );

		// A shallow copy, not `normalizeSettings( field.settings )` used
		// as-is -- the multi-select-default normalization right below
		// needs somewhere of its own to write `default` into without
		// mutating `field.settings` itself (still live in `fields` state).
		const settings = { ...normalizeSettings( field.settings ) };

		if (
			isMultipleFor( field.type ) &&
			'default' in settings &&
			! Array.isArray( settings.default )
		) {
			// A checkbox field's own default was a single string before
			// "multiple checkboxes could be checked by default" -- see
			// this component's own docblock -- so an already-saved field
			// from before that still has one needs wrapping into a
			// single-element array here, the same tolerant one-time
			// upgrade `RecordForm.jsx`'s own initialValues logic applies
			// when it reads this same settings.default back.
			settings.default = settings.default ? [ settings.default ] : [];
		}

		const defaults = {
			name: field.name,
			label: field.label,
			type: field.type,
			relationshipMethod: field.relationship_method || '',
			choices: field.choices && field.choices.length > 0 ? field.choices : [],
			required: Boolean( field.required ),
			settings,
			conditional_logic: field.conditional_logic || {
				enabled: false,
				groups: [],
			},
		};
		reset( defaults );
		lastSavedRef.current = defaults;
		isNewDraftRef.current = false;
		editOriginalNameRef.current = field.name;
		// An already-saved field's own Name is a real column -- never
		// re-synced from Label edits, see nameManuallyEditedRef's own
		// comment above.
		nameManuallyEditedRef.current = true;

		setEditingIndex( index );
		setIsNewDraft( false );
		setEditOriginalName( field.name );
		setEditTab( 'general' );
	};

	// The whole row is the "Edit" control (see this component's own
	// docblock) -- clicking the row that's already open collapses it,
	// flushing any still-pending change first (there's no separate
	// "Done"/"Save" to click instead -- autosave already covers every
	// change); clicking any OTHER row while one is open SWITCHES to it --
	// closes/flushes whatever's currently open (same as above), then
	// opens the one actually clicked. This used to just do nothing at
	// all instead (a real bug, reported as "Edit/Duplicate clicks fail
	// when another field is open" -- it read as broken, not as the
	// deliberate "one editing surface at a time" constraint it actually
	// was, since nothing here gave any visual sign a click had been
	// silently ignored).
	const handleRowClick = async ( field, index ) => {
		if ( null !== deletingName || reordering ) {
			return;
		}

		if ( editingIndex === index ) {
			finishEditing();
			return;
		}

		if ( null !== editingIndex ) {
			// finishEditing() may remove a never-saved draft row at the
			// currently-open index (see its own docblock) -- if it does,
			// every index after that one shifts down by one, so `index`
			// (captured above, before that shift) needs the same
			// adjustment to still land on the row actually clicked. The
			// `field` object itself doesn't need re-fetching -- unlike
			// the row being closed, it's already a real saved field
			// (a still-unsaved draft can only ever be the ONE currently
			// open row, never a different one you'd click Edit on), so
			// its own data can't have changed underneath this click.
			const closedWasUnsavedDraft = isNewDraftRef.current;
			const closedIndex = editingIndex;

			await finishEditing();

			const adjustedIndex =
				closedWasUnsavedDraft && index > closedIndex
					? index - 1
					: index;

			startEdit( field, adjustedIndex );
			return;
		}

		startEdit( field, index );
	};

	// The row-actions' own explicit "Edit" link (see this component's own
	// docblock, and the wp-admin list-table row-actions convention it
	// mirrors) -- same toggle/switch behavior as clicking the row itself
	// (handleRowClick, above).
	const handleEditClick = ( field, index ) => ( event ) => {
		event.preventDefault();
		event.stopPropagation();

		handleRowClick( field, index );
	};

	const finishEditing = async () => {
		clearTimeout( debounceTimerRef.current );
		// This flushes explicitly below -- clearing this here too means the
		// debounce effect's own cleanup (about to run once editingIndex
		// changes to null) finds nothing left pending and doesn't flush a
		// second time.
		pendingSaveValuesRef.current = null;

		const values = getValues();

		// Flush a still-pending change rather than dropping it -- closing
		// right after typing shouldn't silently discard the last edit.
		await attemptAutosave( values, editingIndex );

		// isNewDraftRef, not the (possibly stale, pre-await) isNewDraft
		// state -- attemptAutosave() above may have just flipped this to
		// false, and this needs to see that, not the value from before it
		// ran.
		if ( isNewDraftRef.current ) {
			setFields( ( current ) =>
				current.filter( ( _field, i ) => i !== editingIndex )
			);
		}

		setEditingIndex( null );
		setIsNewDraft( false );
	};

	const handleDelete = async ( name ) => {
		setError( '' );
		setDeletingName( name );

		try {
			await apiFetch( `${ basePath }/${ encodeURIComponent( name ) }`, {
				method: 'DELETE',
			} );
			setFields( ( current ) =>
				current.filter( ( field ) => field.name !== name )
			);
		} catch ( err ) {
			setError( err.message );
		} finally {
			setDeletingName( null );
		}
	};

	// A plain POST of a copy of $field's own current, already-saved data --
	// same server-side validation/migration path as typing a brand new
	// field into the "Add Field" flow, just pre-filled. "_copy" always
	// wins any name collision with the original itself; a collision with
	// some OTHER already-duplicated copy (a second Duplicate click) is
	// still possible and simply surfaces the server's own
	// gateway_field_name_exists error, same as typing a taken name by
	// hand would. Relationship_Field_Type fields (whose real name is
	// always derived from $field.relationship_method, never $name --
	// see Model_Fields::derive_relationship_field_name()) can't be
	// duplicated at all yet this way: the derived name is identical to
	// the original's own, so the request always collides -- left to
	// surface that same error rather than silently pretending to
	// support it.
	const handleDuplicate = async ( field ) => {
		setError( '' );

		try {
			const body = {
				name: `${ field.name }_copy`,
				label: field.label ? `${ field.label } (Copy)` : '',
				type: field.type,
				required: Boolean( field.required ),
			};

			if ( relationshipTypeFor( field.type ) ) {
				body.relationship_method = field.relationship_method;
			}

			if ( hasChoicesFor( field.type ) ) {
				body.choices = field.choices || [];
			}

			const saved = await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( body ),
			} );

			setFields( ( current ) => [ ...current, saved ] );
		} catch ( err ) {
			setError( err.message );
		}
	};

	const handleDragStart = ( name ) => ( event ) => {
		setDraggedName( name );
		event.dataTransfer.effectAllowed = 'move';
	};

	const handleDragOver = ( event ) => {
		// A drop target must cancel dragover for onDrop to ever fire --
		// standard (if easy to forget) HTML5 drag-and-drop requirement.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	};

	const handleDrop = ( targetName ) => async ( event ) => {
		event.preventDefault();

		const fromName = draggedName;
		setDraggedName( null );

		if ( ! fromName || fromName === targetName ) {
			return;
		}

		const previousFields = fields;
		const fromIndex = previousFields.findIndex(
			( field ) => field.name === fromName
		);
		const toIndex = previousFields.findIndex(
			( field ) => field.name === targetName
		);

		if ( -1 === fromIndex || -1 === toIndex ) {
			return;
		}

		const reorderedFields = [ ...previousFields ];
		const [ moved ] = reorderedFields.splice( fromIndex, 1 );
		reorderedFields.splice( toIndex, 0, moved );

		setError( '' );
		setReordering( true );
		setFields( reorderedFields ); // optimistic -- reverted below on failure

		try {
			const saved = await apiFetch( `${ basePath }-order`, {
				method: 'PUT',
				body: JSON.stringify( {
					order: reorderedFields.map( ( field ) => field.name ),
				} ),
			} );
			setFields( saved );
		} catch ( err ) {
			setFields( previousFields );
			setError( err.message );
		} finally {
			setReordering( false );
		}
	};

	const renderEditPanel = () => (
		<div className="gateway-field-editor-edit-panel">
			<div className="gateway-subtabs">
				<button
					type="button"
					className={
						'gateway-subtab' +
						( 'general' === editTab ? ' gateway-subtab-active' : '' )
					}
					onClick={ () => setEditTab( 'general' ) }
				>
					General
					{ generalTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Has choices and/or a default value configured"
							aria-label="Has choices and/or a default value configured"
						/>
					) }
				</button>
				<button
					type="button"
					className={
						'gateway-subtab' +
						( 'validation' === editTab ? ' gateway-subtab-active' : '' )
					}
					onClick={ () => setEditTab( 'validation' ) }
				>
					Validation
					{ validationTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Required is on and/or a character limit is configured"
							aria-label="Required is on and/or a character limit is configured"
						/>
					) }
				</button>
				<button
					type="button"
					className={
						'gateway-subtab' +
						( 'presentation' === editTab ? ' gateway-subtab-active' : '' )
					}
					onClick={ () => setEditTab( 'presentation' ) }
				>
					Presentation
					{ presentationTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Has presentation settings configured"
							aria-label="Has presentation settings configured"
						/>
					) }
				</button>
				<button
					type="button"
					className={
						'gateway-subtab' +
						( 'conditional_logic' === editTab
							? ' gateway-subtab-active'
							: '' )
					}
					onClick={ () => setEditTab( 'conditional_logic' ) }
				>
					Conditional Logic
					{ conditionalLogicTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Has conditional logic configured"
							aria-label="Has conditional logic configured"
						/>
					) }
				</button>
			</div>

			<div hidden={ 'general' !== editTab }>
				<div className="gateway-field-editor-form-grid">
					{ /* A plain <div>, NOT <label> like every sibling field in
					   * this grid -- deliberately, not an oversight. A <label>
					   * with more than one labelable descendant still only
					   * designates ONE of them (the first, in tree order) as
					   * its own "labeled control"; clicking anywhere else
					   * inside the label -- including TypeSelect's own OTHER
					   * buttons, e.g. an option deep in its open panel -- also
					   * fires a synthetic click on that first one (the
					   * toggle), re-opening the panel the instant the real
					   * click that just closed it finishes handling. A plain
					   * `<input>`/`<select>`/single-button field never hits
					   * this (it IS the label's own one control, so the
					   * browser's own "don't also forward when you clicked
					   * the control itself" rule already covers it) -- only a
					   * custom widget rendering MULTIPLE of its own buttons,
					   * like this one, actually needs the label dropped. */ }
					<div className="gateway-field-editor-form-field">
						<span>Type</span>
						<Controller
							control={ control }
							name="type"
							render={ ( { field } ) => (
								<TypeSelect
									fieldTypes={ fieldTypes }
									value={ field.value }
									onChange={ field.onChange }
									disabled={ editingIsRelate }
									ariaLabel="Type"
									disabledKeys={ disabledTypeKeys }
								/>
							) }
						/>
					</div>
					{ editingIsRelate && (
						<p className="description">
							This field&rsquo;s relationship can&rsquo;t be
							changed -- remove it and add a new one instead if
							it needs to point somewhere else.
						</p>
					) }
					<label>
						<span>Label</span>
						<input
							type="text"
							className="regular-text"
							placeholder="Label (optional)"
							{ ...register( 'label' ) }
						/>
					</label>
					<label>
						<span>Name</span>
						{ editRelationshipType ? (
							matchingRelationships.length > 0 ? (
								<select { ...register( 'relationshipMethod' ) }>
									{ matchingRelationships.map( ( relationship ) => (
										<option
											key={ relationship.method_name }
											value={ relationship.method_name }
										>
											{ relationshipOptionLabel( relationship ) }
										</option>
									) ) }
								</select>
							) : (
								<span className="description">
									No{ ' ' }
									{ relationshipTypeLabel( editRelationshipType ) }{ ' ' }
									relationships yet -- add one in the
									Relationships tab first.
								</span>
							)
						) : (
							<input
								type="text"
								className="regular-text"
								placeholder="e.g. first_name"
								disabled={ editingIsRelate }
								{ ...register( 'name', {
									onChange: () => {
										// The one thing that permanently ends
										// the Label->Name auto-slug sync for
										// this session -- see
										// nameManuallyEditedRef's own comment
										// further up. RHF's own `onChange`
										// (still what actually updates form
										// state here) fires on top of this,
										// not instead of it -- `register()`
										// merges a config-object `onChange`
										// like this one into its own handler
										// rather than replacing it.
										nameManuallyEditedRef.current = true;
									},
								} ) }
							/>
						) }
						<span className="description">
							Lowercase and underscores only.
						</span>
					</label>
					{ editSupportsBooleanSettings && (
						<label>
							<span>Message</span>
							<input
								type="text"
								className="regular-text"
								placeholder="e.g. Subscribe to our newsletter"
								{ ...register( 'settings.message' ) }
							/>
							<span className="description">
								Displayed next to the checkbox/toggle itself,
								not this field&rsquo;s own Label above.
							</span>
						</label>
					) }
					{ editSupportsDefault && ! editHasChoices && (
						'true_false' === editType ? (
							<label className="gateway-toggle">
								<input
									type="checkbox"
									{ ...register( 'settings.default' ) }
								/>
								<span className="gateway-toggle-slider" aria-hidden="true" />
								<span>Default Value</span>
							</label>
						) : (
							<label>
								<span>Default Value</span>
								{ 'number' === editType ? (
									<input
										type="number"
										step="any"
										className="regular-text"
										{ ...register( 'settings.default' ) }
									/>
								) : (
									<input
										type="text"
										className="regular-text"
										{ ...register( 'settings.default' ) }
									/>
								) }
								<span className="description">
									Appears when creating a new record.
								</span>
							</label>
						)
					) }
					{ ( editSupportsMediaSettings || editSupportsFileSettings || editSupportsUserSettings ) && (
						<label>
							<span>Return Format</span>
							<select
								className="regular-text"
								defaultValue="array"
								{ ...register( 'settings.return_format' ) }
							>
								{ editSupportsFileSettings ? (
									<>
										<option value="array">File Array</option>
										<option value="url">File URL</option>
										<option value="id">File ID</option>
									</>
								) : editSupportsUserSettings ? (
									// No "User URL" option -- a WP user has no
									// single canonical URL the way an
									// attachment does. See Field_Type::
									// supports_user_settings()'s own docblock.
									<>
										<option value="array">User Array</option>
										<option value="id">User ID</option>
									</>
								) : (
									<>
										<option value="array">Image Array</option>
										<option value="url">Image URL</option>
										<option value="id">Image ID</option>
									</>
								) }
							</select>
						</label>
					) }
					{ /* Radio buttons, not a `<select>` like the Return Format
					   * block just above -- copying ACF's own Link field UI
					   * pixel-for-pixel, per a direct request, rather than
					   * folding this into that shared `<select>` (a real
					   * option: this is the exact same underlying
					   * `settings.return_format` key/enum check, just
					   * narrower -- 'array'/'url' only, no 'id'). A plain
					   * `<div>`, not `<label>` -- same two-labelable
					   * -descendants reasoning the Type field's own wrapper
					   * uses: a real `<label>` here would only designate the
					   * FIRST radio as its own labeled control. */ }
					{ editSupportsLinkSettings && (
						<div className="gateway-field-editor-form-field">
							<span>Return Value</span>
							<span className="gateway-field-editor-radio-row">
								<label>
									<input
										type="radio"
										value="array"
										defaultChecked
										{ ...register( 'settings.return_format' ) }
									/>
									Link Array
								</label>
								<label>
									<input
										type="radio"
										value="url"
										{ ...register( 'settings.return_format' ) }
									/>
									Link URL
								</label>
							</span>
							<span className="description">
								Specify the returned value on front end
							</span>
						</div>
					) }
					{ /* A plain <div>, not <label> -- same reasoning as the
					   * Type field's own wrapper above it in this same tab:
					   * two <input>s means two labelable descendants, and a
					   * real <label> only ever designates the FIRST one
					   * (Width) as its own "labeled control." Clicking
					   * directly into Height would still work for typing,
					   * but the label's own click-forwarding would ALSO fire
					   * a synthetic click on Width right after, stealing
					   * focus back to it -- the same class of bug
					   * TypeSelect's own comment describes in more detail,
					   * just manifesting as a focus steal here instead of a
					   * reopened panel. */ }
					{ editSupportsEmbedSettings && (
						<div className="gateway-field-editor-form-field">
							<span>Embed Size</span>
							<div className="gateway-field-editor-media-bounds-row">
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Width</span>
									<input
										type="number"
										min="0"
										step="1"
										className="regular-text"
										placeholder="640"
										{ ...register( 'settings.embed_width' ) }
									/>
									<span className="gateway-record-form-input-addon">px</span>
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Height</span>
									<input
										type="number"
										min="0"
										step="1"
										className="regular-text"
										placeholder="390"
										{ ...register( 'settings.embed_height' ) }
									/>
									<span className="gateway-record-form-input-addon">px</span>
								</span>
							</div>
							<span className="description">
								Leave blank for the default embed size.
							</span>
						</div>
					) }
					{ /* A plain <div>, not <label> -- Source Field is the only
					   * real INPUT here (the note above it is just text), so
					   * this doesn't strictly need dropping for the same
					   * multi-control reason Type/Embed Size do above -- kept
					   * consistent with every other settings block in this
					   * tab anyway. */ }
					{ editSupportsPermalinkSettings && (
						<div className="gateway-field-editor-form-field">
							<span>Source Field</span>
							{ permalinkSourceFieldOptions.length > 0 ? (
								<select
									className="regular-text"
									defaultValue=""
									{ ...register( 'settings.source_field' ) }
								>
									<option value="">
										None -- manual only
									</option>
									{ permalinkSourceFieldOptions.map( ( option ) => (
										<option key={ option.name } value={ option.name }>
											{ option.label }
										</option>
									) ) }
								</select>
							) : (
								<span className="description">
									No eligible text fields on this model
									yet -- add one (Text, Text Area, Email,
									URL, etc.) to auto-slugify from it, or
									leave this manual-only.
								</span>
							) }
							<span className="description">
								When set, this field&rsquo;s slug tracks
								that field&rsquo;s value automatically
								until switched to manual on a given record.
								The URL root and template page are
								configured on the Permalinks tab.
							</span>
						</div>
					) }
				</div>

				{ editHasChoices && (
					<div className="gateway-field-editor-choices-inline">
						<h4>Choices</h4>
						<Controller
							control={ control }
							name="choices"
							render={ ( { field } ) => (
								<ChoicesEditor
									choices={ field.value }
									onChange={ field.onChange }
								/>
							) }
						/>
						{ editSupportsDefault && (
							<label>
								<span>Default Value</span>
								<select
									className="regular-text"
									multiple={ editIsMultiple }
									{ ...register( 'settings.default' ) }
								>
									{ ! editIsMultiple && (
										<option value="">— None —</option>
									) }
									{ ( editChoices || [] )
										.filter( ( choice ) => choice.value.trim() )
										.map( ( choice ) => (
											<option
												key={ choice.value }
												value={ choice.value }
											>
												{ choice.label || choice.value }
											</option>
										) ) }
								</select>
								<span className="description">
									{ editIsMultiple
										? 'Ctrl/Cmd-click (or Shift-click for a range) to check more than one by default. Leave nothing selected for none.'
										: 'Appears when creating a new record.' }
								</span>
							</label>
						) }
					</div>
				) }
			</div>

			<div hidden={ 'validation' !== editTab }>
				<label className="gateway-toggle">
					<input type="checkbox" { ...register( 'required' ) } />
					<span className="gateway-toggle-slider" aria-hidden="true" />
					<span>Required</span>
				</label>
				<p className="description">
					If enabled, a record can&rsquo;t be created without this
					field, and it can&rsquo;t be cleared on an existing one.
				</p>
				{ editSupportsCharacterLimit && (
					<div className="gateway-field-editor-form-grid gateway-field-editor-validation-extra">
						<label>
							<span>Character Limit</span>
							<input
								type="number"
								min="1"
								step="1"
								className="regular-text"
								{ ...register( 'settings.character_limit' ) }
							/>
							<span className="description">
								Leave blank for no limit.
							</span>
						</label>
					</div>
				) }
				{ editSupportsRangeLimits && (
					<div className="gateway-field-editor-form-grid gateway-field-editor-validation-extra">
						<label>
							<span>Minimum Value</span>
							<input
								type="number"
								step="any"
								className="regular-text"
								{ ...register( 'settings.min_value' ) }
							/>
							<span className="description">
								Leave blank for no minimum.
							</span>
						</label>
						<label>
							<span>Maximum Value</span>
							<input
								type="number"
								step="any"
								className="regular-text"
								{ ...register( 'settings.max_value' ) }
							/>
							<span className="description">
								Leave blank for no maximum.
							</span>
						</label>
					</div>
				) }
				{ editSupportsMediaSettings && (
					<div className="gateway-field-editor-form-grid gateway-field-editor-validation-extra">
						<div className="gateway-field-editor-media-bounds-row">
							<div className="gateway-field-editor-media-bounds">
								<span className="gateway-field-editor-media-bounds-heading">
									Minimum
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Width</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.min_width' ) } />
									<span className="gateway-record-form-input-addon">px</span>
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Height</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.min_height' ) } />
									<span className="gateway-record-form-input-addon">px</span>
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">File Size</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.min_size' ) } />
									<span className="gateway-record-form-input-addon">MB</span>
								</span>
							</div>
							<div className="gateway-field-editor-media-bounds">
								<span className="gateway-field-editor-media-bounds-heading">
									Maximum
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Width</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.max_width' ) } />
									<span className="gateway-record-form-input-addon">px</span>
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">Height</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.max_height' ) } />
									<span className="gateway-record-form-input-addon">px</span>
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">File Size</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.max_size' ) } />
									<span className="gateway-record-form-input-addon">MB</span>
								</span>
							</div>
						</div>
						<label>
							<span>Allowed File Types</span>
							<input
								type="text"
								className="regular-text"
								placeholder="e.g. jpg,png,gif"
								{ ...register( 'settings.allowed_types' ) }
							/>
							<span className="description">
								Comma-separated file extensions. Leave blank to allow any.
							</span>
						</label>
					</div>
				) }
				{ editSupportsFileSettings && (
					<div className="gateway-field-editor-form-grid gateway-field-editor-validation-extra">
						<div className="gateway-field-editor-media-bounds-row">
							<div className="gateway-field-editor-media-bounds">
								<span className="gateway-field-editor-media-bounds-heading">
									Minimum
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">File Size</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.min_size' ) } />
									<span className="gateway-record-form-input-addon">MB</span>
								</span>
							</div>
							<div className="gateway-field-editor-media-bounds">
								<span className="gateway-field-editor-media-bounds-heading">
									Maximum
								</span>
								<span className="gateway-record-form-input-group">
									<span className="gateway-record-form-input-addon">File Size</span>
									<input type="number" min="0" step="any" className="regular-text" { ...register( 'settings.max_size' ) } />
									<span className="gateway-record-form-input-addon">MB</span>
								</span>
							</div>
						</div>
						<label>
							<span>Allowed File Types</span>
							<input
								type="text"
								className="regular-text"
								placeholder="e.g. pdf,docx,zip"
								{ ...register( 'settings.allowed_types' ) }
							/>
							<span className="description">
								Comma-separated file extensions. Leave blank to allow any.
							</span>
						</label>
					</div>
				) }
			</div>

			<div hidden={ 'presentation' !== editTab }>
				{ editPresentationFields.length > 0 || editSupportsBooleanSettings ? (
					<div className="gateway-field-editor-form-grid">
						{ editPresentationFields.map( ( key ) => {
							const meta =
								PRESENTATION_FIELD_META[ key ] || {
									label: key,
									type: 'text',
								};

							return (
								<label key={ key }>
									<span>{ meta.label }</span>
									{ 'textarea' === meta.type ? (
										<textarea
											className="regular-text"
											rows={ 3 }
											{ ...register( `settings.${ key }` ) }
										/>
									) : 'number' === meta.type ? (
										<input
											type="number"
											step="any"
											className="regular-text"
											{ ...register( `settings.${ key }` ) }
										/>
									) : 'select' === meta.type ? (
										<select
											className="regular-text"
											{ ...register( `settings.${ key }` ) }
										>
											{ /* `imageSizes` -- the only `select`-type Presentation
											 * setting today -- starts empty until useImageSizes()'s
											 * own fetch resolves; an empty <select> is a harmless,
											 * momentary state rather than something worth a loading
											 * message of its own. */ }
											{ ( 'preview_size' === key ? imageSizes : [] ).map(
												( option ) => (
													<option key={ option.key } value={ option.key }>
														{ option.label }
													</option>
												)
											) }
										</select>
									) : (
										<input
											type="text"
											className="regular-text"
											{ ...register( `settings.${ key }` ) }
										/>
									) }
									{ meta.hint && (
										<span className="description">{ meta.hint }</span>
									) }
								</label>
							);
						} ) }
						{ /* True_False_Field_Type's own Presentation-tab
						 * setting (supports_boolean_settings()) -- wrapped
						 * in a `.gateway-field-editor-form-field` div, the
						 * same established "plain div stand-in for
						 * `<label>`" wrapper the Type field's own row
						 * uses (see its own comment there), rather than
						 * placed here as a bare `.gateway-toggle` `<label>`
						 * directly: a direct grid child, this div gets the
						 * grid's own 32px inter-item gap for free, the
						 * fix for a real bug reported directly ("there is
						 * no space before 'Show Toggle' after
						 * instructions") from an earlier version that
						 * rendered this switch as a sibling AFTER the grid
						 * closed instead of inside it, where nothing
						 * supplied any spacing of its own at all. Kept
						 * OUT of the grid directly as a `<label>` itself,
						 * unlike every other item here, because the
						 * grid's own `.gateway-field-editor-form-grid >
						 * label` rule would otherwise override
						 * `.gateway-toggle`'s own `display: inline-flex`
						 * with its own `display: flex; flex-direction:
						 * column`, stacking the switch and its own text
						 * vertically instead of side by side. */ }
						{ editSupportsBooleanSettings && (
							<div className="gateway-field-editor-form-field">
								<label className="gateway-toggle">
									<input
										type="checkbox"
										{ ...register( 'settings.show_toggle' ) }
									/>
									<span className="gateway-toggle-slider" aria-hidden="true" />
									<span>Show Toggle</span>
								</label>
								<span className="description">
									If enabled, this field renders as a toggle
									switch in the record editor instead of a
									plain checkbox.
								</span>
							</div>
						) }
					</div>
				) : (
					<p className="description">
						This field type has no presentation settings yet.
					</p>
				) }
			</div>

			<div hidden={ 'conditional_logic' !== editTab }>
				<label className="gateway-toggle">
					<Controller
						control={ control }
						name="conditional_logic.enabled"
						render={ ( { field } ) => (
							<input
								type="checkbox"
								checked={ field.value }
								onChange={ ( event ) => {
									const checked = event.target.checked;
									field.onChange( checked );

									// Turning it on with nothing configured
									// yet seeds one blank rule straight
									// away, matching what the toggle's own
									// "Show this field if" section looks
									// like once it's actually usable --
									// there's no reason to make a site
									// owner click "Add rule group" a
									// second time immediately after
									// switching this on.
									if (
										checked &&
										0 === ( getValues( 'conditional_logic.groups' ) || [] ).length
									) {
										// `field: ''`, genuinely blank -- NOT
										// `conditionalLogicOtherFields[0]`'s own
										// name. Pre-picking some field the site
										// owner never actually chose would turn
										// this into a real, active "Value is
										// equal to \"\"" condition against
										// whatever the model's first other field
										// happens to be the instant this toggle
										// is switched on, before anyone has
										// configured anything at all -- see
										// ConditionalLogicEditor's own
										// `blankRule()` docblock for the exact
										// failure this caused (visible on Add
										// New, silently hidden on Edit).
										setValue( 'conditional_logic.groups', [
											{
												rules: [
													{
														field: '',
														operator: 'value_equals',
														value: '',
													},
												],
											},
										] );
									}
								} }
							/>
						) }
					/>
					<span className="gateway-toggle-slider" aria-hidden="true" />
					<span>Conditional Logic</span>
				</label>
				<p className="description">
					If enabled, this field only appears when the rules
					below are met.
				</p>
				{ editConditionalLogic.enabled && (
					<Controller
						control={ control }
						name="conditional_logic.groups"
						render={ ( { field } ) => (
							<ConditionalLogicEditor
								groups={ field.value || [] }
								onChange={ field.onChange }
								otherFields={ conditionalLogicOtherFields }
							/>
						) }
					/>
				) }
			</div>

			{ ( savingEdit || justSaved ) && (
				<p className="gateway-field-editor-save-status">
					{ savingEdit ? 'Saving…' : 'Saved' }
				</p>
			) }
		</div>
	);

	return (
		<div className="gateway-field-editor">
			<h3>Fields</h3>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ fields.length === 0 ? (
				<p className="description">No fields yet.</p>
			) : (
				<table className="widefat striped gateway-field-editor-table">
					<thead>
						<tr>
							<th className="gateway-field-editor-drag-col"></th>
							<th>Label</th>
							<th>Name</th>
							<th>Type</th>
						</tr>
					</thead>
					<tbody>
						{ fields.map( ( field, index ) => {
							const isEditingThisRow = editingIndex === index;

							// While this row's own panel is open, its summary
							// row shows the LIVE (not-yet-necessarily-saved)
							// values instead of the last-saved `field` --
							// otherwise a rename wouldn't visibly update the
							// very row you're renaming until the debounced
							// autosave actually lands, up to
							// AUTOSAVE_DEBOUNCE_MS later.
							const rowName = isEditingThisRow
								? editRelationshipType
									? editOriginalName || editRelationshipMethod || ''
									: editName
								: field.name;
							const rowLabel = isEditingThisRow ? editLabel : field.label;
							const rowType = isEditingThisRow ? editType : field.type;

							// A real bug, reported directly: typing into a new
							// field's Name/Label (or any input in an existing
							// field's own panel) would suddenly lose focus a
							// few characters in. Root cause: this row used to
							// be keyed by `field.id ?? 'draft'` -- stable for
							// an already-saved field (its `id` never changes),
							// but NOT for a brand new, still-unsaved draft
							// (`handleStartAdd()` appends one with no `id` at
							// all). The moment autosave's first successful
							// POST assigns it a real id (AUTOSAVE_DEBOUNCE_MS
							// after typing stops -- see that constant), this
							// row's own key flips from the string `'draft'` to
							// a real number, and React -- seeing a changed key
							// -- tears down the old `<tr>` (Label input mid
							// -focus included) and mounts a brand new one
							// rather than reusing it, stealing focus out from
							// under whoever was still typing.
							//
							// A draft row is ALWAYS the one currently being
							// edited (it can't exist any other way -- see
							// finishEditing()'s own docblock: an unsaved draft
							// is removed the moment its own panel closes), so
							// `isEditingThisRow` alone is already a perfectly
							// stable, collision-free key for it: there's only
							// ever one editing row at a time, and its identity
							// (draft or not) never needs to change across the
							// save that assigns it a real id. Every OTHER
							// (non-editing, already-saved) row keeps using its
							// own real `field.id`, exactly as before -- that's
							// what keeps drag-reorder's own DOM reuse working.
							const rowKey = isEditingThisRow ? 'editing-row' : field.id;

							return [
								<tr
									key={ rowKey }
									onDragOver={
										dragEnabled ? handleDragOver : undefined
									}
									onDrop={
										dragEnabled
											? handleDrop( field.name )
											: undefined
									}
									onClick={ () => handleRowClick( field, index ) }
									className={
										( draggedName === field.name
											? 'gateway-field-editor-row-dragging '
											: '' ) +
										( isEditingThisRow
											? 'gateway-field-editor-row-active'
											: '' )
									}
								>
									<td className="gateway-field-editor-drag-col">
										<span className="gateway-field-editor-drag-col-inner">
											<span
												className={
													'gateway-field-editor-grip' +
													( dragEnabled
														? ''
														: ' gateway-field-editor-grip-disabled' )
												}
												draggable={ dragEnabled }
												onDragStart={ handleDragStart( field.name ) }
												onClick={ ( event ) =>
													event.stopPropagation()
												}
												title="Drag to reorder"
											>
												<GripVertical
													size={ 16 }
													aria-hidden="true"
												/>
											</span>
											{ isEditingThisRow ? (
												<ChevronDown size={ 18 } aria-hidden="true" />
											) : (
												<ChevronRight size={ 18 } aria-hidden="true" />
											) }
										</span>
									</td>
									<td>
										<span className="gateway-field-editor-row-title">
											{ rowLabel }
										</span>
										<div className="row-actions">
											<span className="edit">
												<a
													href="#"
													onClick={ handleEditClick(
														field,
														index
													) }
												>
													Edit
												</a>
											</span>
											{ ' | ' }
											<span className="duplicate">
												<a
													href="#"
													onClick={ ( event ) => {
														event.stopPropagation();
														event.preventDefault();
														// Unlike Edit (above) or Delete (below), this never
														// needs to check `editingIndex` at all -- handleDuplicate()
														// only ever APPENDS a new row at the very end of `fields`,
														// so it can never shift any OTHER row's own index out from
														// under an open edit panel, whatever else is currently
														// open. Blocking it while another row was open used to be
														// a real bug, reported as "Duplicate click fails when
														// another field is open."
														handleDuplicate( field );
													} }
												>
													Duplicate
												</a>
											</span>
											{ ' | ' }
											<span className="delete">
												<a
													href="#"
													onClick={ ( event ) => {
														event.stopPropagation();
														event.preventDefault();
														if (
															null === editingIndex &&
															null === deletingName
														) {
															handleDelete( field.name );
														}
													} }
												>
													{ deletingName === field.name
														? 'Deleting…'
														: 'Delete' }
												</a>
											</span>
										</div>
									</td>
									<td>
										<code>{ rowName }</code>
									</td>
									<td>
										{ fieldTypes.find(
											( type ) => type.key === rowType
										)?.label || rowType }
									</td>
								</tr>,
								isEditingThisRow && (
									// Only ever rendered for the editing row (see
									// the `isEditingThisRow &&` guard) -- same
									// "never let the draft-to-saved id transition
									// change this row's own key" fix as `rowKey`
									// above, just simpler here: this one's ALWAYS
									// the editing row, so a fixed literal is
									// already a stable, collision-free key on its
									// own (there's only ever one of these mounted
									// at a time).
									<tr key="editing-panel">
										<td
											colSpan={ 4 }
											className="gateway-field-editor-panel-cell"
										>
											{ renderEditPanel() }
										</td>
									</tr>
								),
							];
						} ) }
					</tbody>
				</table>
			) }

			{ null === editingIndex && (
				<p>
					<button
						type="button"
						className="button button-primary"
						onClick={ handleStartAdd }
					>
						+ Add Field
					</button>
				</p>
			) }
		</div>
	);
}
