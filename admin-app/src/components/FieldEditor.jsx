import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useRelationshipTypes from '../hooks/useRelationshipTypes.js';
import ChoicesEditor from './ChoicesEditor.jsx';

const AUTOSAVE_DEBOUNCE_MS = 800;

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
 * **Autosaves -- no Save/Cancel to manage.** The panel's own form state is
 * a single React Hook Form instance (`useForm`), `reset()` to a field's
 * current values (or a blank draft's) whenever editing starts. A `watch()`
 * subscription debounces every value change by `AUTOSAVE_DEBOUNCE_MS`
 * and, once the result actually differs from what's currently saved
 * (`lastSavedRef`) AND is valid enough to submit at all, fires the exact
 * same POST/PUT this used to wait for an explicit Save click to send --
 * so typing a Label, flipping Required, or reordering a choice just
 * takes effect shortly after you stop, the same way `label`-only edits
 * already ran no migration at all. The one button left is "Done", which
 * flushes any still-pending change immediately (so closing right after
 * typing never drops it) and then closes the panel -- removing the row
 * entirely if it's a draft that never actually reached a valid, saved
 * state.
 *
 * This does mean a field's Name going through several real RENAME COLUMN
 * migrations if someone pauses mid-word while typing it (each pause past
 * the debounce window commits whatever's been typed so far) -- an
 * accepted trade-off for "changes just happen," not something this tries
 * to special-case away by treating Name differently from every other
 * input.
 *
 * **The row never disappears -- the panel opens right underneath it, and
 * the whole row (not a separate "Edit" button) is what opens/closes it.**
 * Clicking the row that's already open collapses it (same flush-then-close
 * as the panel's own "Done" button); clicking a different one while one
 * is open does nothing, the same "one editing surface at a time"
 * constraint a disabled Edit button used to enforce. The open row's own
 * cells show the LIVE, not-yet-necessarily-saved values (name/label/type)
 * rather than freezing at whatever was last actually saved, so renaming a
 * field is visible on its own row immediately, not up to
 * `AUTOSAVE_DEBOUNCE_MS` later once the request lands.
 *
 * `editingIndex` (an index into `fields`, not a name -- a draft has no
 * name yet to key off of) tracks which single row is open; `isNewDraft`
 * is what actually differs between a brand new field and an existing one
 * (POST vs. PUT, and whether "Done" with nothing ever saved removes the
 * row). Because autosave can flip a draft into "saved" mid-session (the
 * moment its first valid save succeeds), `isNewDraftRef`/`editOriginalNameRef`
 * mirror that state into refs the autosave chain itself reads -- reading
 * the plain state variables there would risk seeing a stale value from
 * before React re-renders. Every autosave attempt (the debounce timer, or
 * "Done"/a row click flushing one immediately) is chained through
 * `saveChainRef` rather than fired independently, so two attempts arriving
 * close together (e.g. "Done" clicked right as a debounced save is still
 * in flight) run strictly one after another instead of racing -- the
 * second one always sees the first one's now-current `isNewDraftRef`/
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
 * regardless of type), then **Presentation** and **Conditional Logic**,
 * both intentionally empty placeholders for now -- reserved tabs, not
 * yet backed by anything on the PHP side. A small green dot on General's
 * or Validation's own heading marks that it currently holds real content
 * (at least one non-blank choice; Required switched on) -- based on the
 * live, already-autosaved values, not a "changed since this session
 * started" diff, so it's still showing the next time this same field is
 * opened for editing, not just while it's being actively typed into.
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
	// from finishEditing() flushing a last change on "Done" -- chains onto
	// this instead of firing independently, so two attempts arriving close
	// together run strictly one after another (each seeing the OTHER's
	// now-current isNewDraftRef/lastSavedRef) rather than racing: without
	// this, "Done" clicked right as a debounced save was still in flight
	// could see stale isNewDraftRef.current, wrongly conclude a request
	// that's actually about to succeed never happened, and delete the row
	// out from under it.
	const saveChainRef = useRef( Promise.resolve() );
	const debounceTimerRef = useRef( null );
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
		},
	} );

	const watched = watch();
	const editName = watched.name;
	const editLabel = watched.label;
	const editType = watched.type;
	const editRelationshipMethod = watched.relationshipMethod;
	const editChoices = watched.choices;
	const editRequired = watched.required;

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

	const editRelationshipType = relationshipTypeFor( editType );
	const editHasChoices = hasChoicesFor( editType );
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

	const arraysEqual = ( a, b ) =>
		a.length === b.length && a.every( ( value, index ) => value === b[ index ] );

	const snapshotsEqual = ( a, b ) =>
		null !== a &&
		null !== b &&
		a.name === b.name &&
		a.label === b.label &&
		a.type === b.type &&
		a.relationshipMethod === b.relationshipMethod &&
		a.required === b.required &&
		arraysEqual( a.choices, b.choices );

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
			debounceTimerRef.current = setTimeout( () => {
				attemptAutosave( values, editingIndex );
			}, AUTOSAVE_DEBOUNCE_MS );
		} );

		return () => {
			subscription.unsubscribe();
			clearTimeout( debounceTimerRef.current );
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
			},
		] );

		const defaults = {
			name: '',
			label: '',
			type: 'text',
			relationshipMethod: '',
			choices: [],
			required: false,
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

	// The whole row is the "Edit" control now (see this component's own
	// docblock) -- clicking the row that's already open collapses it
	// (same flush-then-close as the panel's own "Done" button); clicking
	// any OTHER row while one is open does nothing, the same "one editing
	// surface at a time" constraint the old per-row Edit/Delete buttons'
	// own `disabled` already enforced.
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

	const finishEditing = async () => {
		clearTimeout( debounceTimerRef.current );

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
				<p className="description">Nothing here yet.</p>
			</div>

			<div hidden={ 'conditional_logic' !== editTab }>
				<p className="description">Nothing here yet.</p>
			</div>

			<p className="gateway-field-editor-form-actions">
				<span className="gateway-field-editor-save-status">
					{ savingEdit ? 'Saving…' : justSaved ? 'Saved' : '' }
				</span>{ ' ' }
				<button type="button" className="button" onClick={ finishEditing }>
					Done
				</button>
			</p>
		</div>
	);

	return (
		<div className="gateway-field-editor">
			<h3>Fields</h3>
			<p className="description">
				Fields become this model&rsquo;s mass-assignable attributes --
				each one is a real column on <code>{ modelClass }</code>
				&rsquo;s own table. Changes here save automatically a moment
				after you make them; dragging a row to reorder it never runs a
				migration, editing everything else can.
			</p>

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
							<th>Type</th>
							<th>Label</th>
							<th>Name</th>
							<th></th>
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
									draggable={ dragEnabled }
									onDragStart={ handleDragStart( field.name ) }
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
									<td
										className="gateway-field-editor-drag-col"
										title={
											isEditingThisRow
												? 'Collapse'
												: 'Expand (or drag the row to reorder)'
										}
									>
										{ isEditingThisRow ? (
											<ChevronDown size={ 18 } aria-hidden="true" />
										) : (
											<ChevronRight size={ 18 } aria-hidden="true" />
										) }
									</td>
									<td>
										{ fieldTypes.find(
											( type ) => type.key === rowType
										)?.label || rowType }
									</td>
									<td>{ rowLabel }</td>
									<td>
										<code>{ rowName }</code>
									</td>
									<td>
										<button
											type="button"
											className="button"
											onClick={ ( event ) => {
												event.stopPropagation();
												handleDelete( field.name );
											} }
											disabled={
												null !== editingIndex ||
												deletingName === field.name ||
												reordering
											}
										>
											{ deletingName === field.name
												? 'Deleting…'
												: 'Delete' }
										</button>
									</td>
								</tr>,
								isEditingThisRow && (
									<tr key={ `${ field.id ?? 'draft' }-panel` }>
										<td colSpan={ 5 }>{ renderEditPanel() }</td>
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
