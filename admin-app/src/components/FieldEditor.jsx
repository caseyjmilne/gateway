import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { ChevronRight, ChevronDown, GripVertical } from 'lucide-react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useRelationshipTypes from '../hooks/useRelationshipTypes.js';
import ChoicesEditor from './ChoicesEditor.jsx';

const AUTOSAVE_DEBOUNCE_MS = 800;

// The admin app's own fixed catalog of "Presentation" settings -- see
// Gateway\Field_Type::presentation_fields()'s own docblock for why this
// is a small, fixed vocabulary a type only ever selects a SUBSET of,
// rather than each type inventing its own arbitrary keys: one shared
// catalog here is what lets this component render any of them generically
// (an `<input>` or `<textarea>` per recognized key, looked up by name)
// instead of needing its own hardcoded UI for every field type that ever
// gains a presentation setting.
const PRESENTATION_FIELD_META = {
	placeholder: { label: 'Placeholder', type: 'text' },
	step: { label: 'Step Size', type: 'number' },
	prepend: { label: 'Prepend', type: 'text' },
	append: { label: 'Append', type: 'text' },
	instructions: { label: 'Instructions', type: 'textarea' },
};

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
 * (clicking it again, or its own row-action "Edit" is never needed for
 * that since it only opens) flushes any still-pending change immediately
 * first, so closing right after typing never drops it, then removes the
 * row entirely if it's a draft that never actually reached a valid,
 * saved state. The other way a change can still be mid-debounce --
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
 * (flushing first, as above); clicking a different row while one is open
 * does nothing, the same "one editing surface at a time" constraint a
 * disabled Edit button used to enforce. The open row's own cells show
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
 * Duplicate | Delete", plain text links, `.row-actions`) appears under
 * the Label cell on the same row hover -- each one calls
 * `event.stopPropagation()` so clicking it doesn't ALSO trigger the
 * row's own open/close click underneath it.
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
 * The type dropdown is built from useFieldTypes() (Gateway\Field_Type_Registry,
 * via GET /field-types) rather than a hardcoded list here, so a future
 * field type shows up automatically.
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
 * layout: **General** (Name/Label/Type, plus -- inline, below those,
 * never a tab of its own -- a ChoicesEditor for the field's own
 * orderable choice list, Gateway\\Model_Field_Choices on the server,
 * shown only when the picked type's own `has_choices` is true), then
 * **Validation** (currently just a "Required" toggle, Gateway\\Model_Fields::
 * validate_required_fields() on the server -- applies to every field
 * regardless of type), then **Presentation** (one `<input>`/`<textarea>`
 * per key in the picked type's own `presentation_fields` -- see
 * `PRESENTATION_FIELD_META` above, and `Field_Type::presentation_fields()`'s
 * own docblock on the PHP side for the whole "different types need
 * different extra data" design this is the first real use of -- Text and
 * Number recognize these today (Number also gets its own `step`, a plain
 * number input rendered via `PRESENTATION_FIELD_META`'s own `type:
 * 'number'`, in between Placeholder and Prepend -- the order a type's own
 * `presentation_fields` lists a key in is the order this tab renders it
 * in); a plain note instead for every other type, which recognizes
 * none), and **Conditional Logic**, still an intentionally empty
 * placeholder -- a reserved tab, not yet backed by anything on the PHP
 * side. A small green dot on a tab's own heading (General/Validation/
 * Presentation) marks that it currently holds real content (a non-blank
 * choice; Required switched on; a non-blank presentation setting) --
 * based on the live, already-autosaved values, not a "changed since this
 * session started" diff, so it's still showing the next time this same
 * field is opened for editing, not just while it's being actively typed
 * into.
 *
 * "Buttons"/"Select"/"Radio"/"Checkbox" (any Choice_Field_Type -- each
 * type's own `has_choices` from useFieldTypes()) are the one case where
 * General's own inline Choices section is more than absent: reordering,
 * adding, or removing a choice is a normal in-place (auto-saved) edit
 * here, the same as a renamed field or a changed label is -- there's no
 * "immutable once created" rule for choices the way there is for a
 * relate field's own relationship (above).
 */
export default function FieldEditor( { modelClass, initialFields, relationships = [] } ) {
	const fieldTypes = useFieldTypes();
	const relationshipTypes = useRelationshipTypes();
	const [ fields, setFields ] = useState( initialFields || [] );
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

	const editRelationshipType = relationshipTypeFor( editType );
	const editHasChoices = hasChoicesFor( editType );
	const editPresentationFields = presentationFieldsFor( editType );
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

	// A tab's own dot reflects whether it currently holds real content --
	// the live (already-autosaved-or-about-to-be) values, not a diff
	// against this session's own starting point, so it's still showing
	// the next time this field is reopened for editing, not just while
	// it's being actively typed into.
	const choicesTabHasContent = editChoices.some( ( choice ) => choice.trim() );
	const requiredTabHasContent = Boolean( editRequired );
	const presentationTabHasContent = Object.values( editSettings ).some(
		( value ) => value && String( value ).trim()
	);

	const arraysEqual = ( a, b ) =>
		a.length === b.length && a.every( ( value, index ) => value === b[ index ] );

	const settingsEqual = ( a, b ) => {
		const aKeys = Object.keys( a || {} );
		const bKeys = Object.keys( b || {} );

		return (
			aKeys.length === bKeys.length &&
			aKeys.every( ( key ) => ( a || {} )[ key ] === ( b || {} )[ key ] )
		);
	};

	const snapshotsEqual = ( a, b ) =>
		null !== a &&
		null !== b &&
		a.name === b.name &&
		a.label === b.label &&
		a.type === b.type &&
		a.relationshipMethod === b.relationshipMethod &&
		a.required === b.required &&
		arraysEqual( a.choices, b.choices ) &&
		settingsEqual( a.settings, b.settings );

	const isValidToSaveValues = ( values ) => {
		const relationshipType = relationshipTypeFor( values.type );

		const nameOk = relationshipType
			? Boolean( values.relationshipMethod )
			: Boolean( values.name.trim() );

		const choicesOk =
			! hasChoicesFor( values.type ) ||
			values.choices.filter( ( choice ) => choice.trim() ).length > 0;

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
		body.settings = values.settings || {};

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
		};
		reset( defaults );
		lastSavedRef.current = null; // nothing saved yet at all -- anything valid should autosave.
		isNewDraftRef.current = true;
		editOriginalNameRef.current = '';

		setEditingIndex( fields.length );
		setIsNewDraft( true );
		setEditOriginalName( '' );
		setEditTab( 'general' );
	};

	const startEdit = ( field, index ) => {
		setError( '' );

		const defaults = {
			name: field.name,
			label: field.label,
			type: field.type,
			relationshipMethod: field.relationship_method || '',
			choices: field.choices && field.choices.length > 0 ? field.choices : [],
			required: Boolean( field.required ),
			settings: field.settings || {},
		};
		reset( defaults );
		lastSavedRef.current = defaults;
		isNewDraftRef.current = false;
		editOriginalNameRef.current = field.name;

		setEditingIndex( index );
		setIsNewDraft( false );
		setEditOriginalName( field.name );
		setEditTab( 'general' );
	};

	// The whole row is the "Edit" control (see this component's own
	// docblock) -- clicking the row that's already open collapses it,
	// flushing any still-pending change first (there's no separate
	// "Done"/"Save" to click instead -- autosave already covers every
	// change); clicking any OTHER row while one is open does nothing, the
	// same
	// "one editing surface at a time" constraint the old per-row Edit/
	// Delete buttons' own `disabled` already enforced.
	const handleRowClick = ( field, index ) => {
		if ( null !== deletingName || reordering ) {
			return;
		}

		if ( editingIndex === index ) {
			finishEditing();
			return;
		}

		if ( null !== editingIndex ) {
			return;
		}

		startEdit( field, index );
	};

	// The row-actions' own explicit "Edit" link (see this component's own
	// docblock, and the wp-admin list-table row-actions convention it
	// mirrors) -- unlike clicking the row itself, this never toggles an
	// already-open row closed; it only ever opens.
	const handleEditClick = ( field, index ) => ( event ) => {
		event.preventDefault();
		event.stopPropagation();

		if ( null === editingIndex ) {
			startEdit( field, index );
		}
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
			<div className="nav-tab-wrapper gateway-field-editor-subtabs">
				<button
					type="button"
					className={
						'nav-tab' +
						( 'general' === editTab ? ' nav-tab-active' : '' )
					}
					onClick={ () => setEditTab( 'general' ) }
				>
					General
					{ choicesTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Has choices configured"
							aria-label="Has choices configured"
						/>
					) }
				</button>
				<button
					type="button"
					className={
						'nav-tab' +
						( 'validation' === editTab ? ' nav-tab-active' : '' )
					}
					onClick={ () => setEditTab( 'validation' ) }
				>
					Validation
					{ requiredTabHasContent && (
						<span
							className="gateway-tab-changed-dot"
							title="Required is on"
							aria-label="Required is on"
						/>
					) }
				</button>
				<button
					type="button"
					className={
						'nav-tab' +
						( 'presentation' === editTab ? ' nav-tab-active' : '' )
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
						'nav-tab' +
						( 'conditional_logic' === editTab
							? ' nav-tab-active'
							: '' )
					}
					onClick={ () => setEditTab( 'conditional_logic' ) }
				>
					Conditional Logic
				</button>
			</div>

			<div hidden={ 'general' !== editTab }>
				<div className="gateway-field-editor-form-grid">
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
								{ ...register( 'name' ) }
							/>
						) }
						<span className="description">
							Always stored lowercase -- it becomes the real
							column name.
						</span>
					</label>
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
						<span>Type</span>
						<select disabled={ editingIsRelate } { ...register( 'type' ) }>
							{ fieldTypes.map( ( type ) => (
								<option key={ type.key } value={ type.key }>
									{ type.label }
								</option>
							) ) }
						</select>
					</label>
					{ editingIsRelate && (
						<p className="description">
							This field&rsquo;s relationship can&rsquo;t be
							changed -- remove it and add a new one instead if
							it needs to point somewhere else.
						</p>
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
			</div>

			<div hidden={ 'presentation' !== editTab }>
				{ editPresentationFields.length > 0 ? (
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
									) : (
										<input
											type="text"
											className="regular-text"
											{ ...register( `settings.${ key }` ) }
										/>
									) }
								</label>
							);
						} ) }
					</div>
				) : (
					<p className="description">
						This field type has no presentation settings yet.
					</p>
				) }
			</div>

			<div hidden={ 'conditional_logic' !== editTab }>
				<p className="description">Nothing here yet.</p>
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

							return [
								<tr
									key={ field.id ?? 'draft' }
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
										{ rowLabel }
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
														if ( null === editingIndex ) {
															handleDuplicate( field );
														}
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
									<tr key={ `${ field.id ?? 'draft' }-panel` }>
										<td colSpan={ 4 }>{ renderEditPanel() }</td>
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
