import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useRelationshipTypes from '../hooks/useRelationshipTypes.js';
import ChoicesEditor from './ChoicesEditor.jsx';

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
 * One editing surface, not two: "Add Field" appends a draft row straight
 * into the table (`{ name: '', label: '', type: 'text', choices: [] }`,
 * no id yet) and immediately opens it in the exact same inline edit panel
 * an existing row's own "Edit" button opens -- there's no separate
 * standalone "Add Field" form any more. `editingIndex` (an index into
 * `fields`, not a name -- a draft has no name yet to key off of) tracks
 * which single row is open; `isNewDraft` is the one thing that actually
 * differs at save time (POST a new field vs. PUT the field found at
 * `editOriginalName`) and at cancel time (a cancelled draft is removed
 * from the list entirely; a cancelled edit of a real field just closes
 * the panel, since editing state lives separately from `fields` itself
 * until Save actually commits it).
 *
 * Label is the one field-level thing here that *isn't* a schema change --
 * it's a plain display string (shown in place of the raw name wherever a
 * field is rendered for a human, e.g. RecordForm/RecordsCrud), so editing
 * it alone never runs a migration. Left blank, the server derives one
 * from the name automatically (e.g. "first_name" -> "First Name").
 *
 * Fields are a sortable list -- drag a row (anywhere on it, not just the
 * "⠿" handle cell) to reorder it, via native HTML5 drag-and-drop rather
 * than a library, and the same "reorder is metadata-only" reasoning as
 * label: PUT .../fields-order takes the whole new name order and never
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
 * inputs -- only its Label stays editable, same as every other field type.
 *
 * "Buttons"/"Select"/"Radio"/"Checkbox" (any Choice_Field_Type -- each
 * type's own `has_choices` from useFieldTypes()) are a lighter special
 * case: unlike a relate field, everything about the field (name, type,
 * label) stays freely editable -- only one extra thing appears, a second
 * "Choices" tab (alongside "General") holding a ChoicesEditor for the
 * field's own orderable choice list (Gateway\\Model_Field_Choices on the
 * server), required (at least one non-blank choice) whenever the picked
 * type has one. Reordering, adding, or removing a choice is a normal
 * in-place edit, submitted the same way a renamed field or a changed
 * label is -- there's no "immutable once created" rule for choices the
 * way there is for a relate field's own relationship.
 */
export default function FieldEditor( { modelClass, initialFields, relationships = [] } ) {
	const fieldTypes = useFieldTypes();
	const relationshipTypes = useRelationshipTypes();
	const [ fields, setFields ] = useState( initialFields || [] );
	const [ error, setError ] = useState( '' );

	// The single row currently open for editing OR adding, by its index
	// in `fields` (not by name -- a not-yet-saved draft has none yet).
	// `null` means nothing is open. `isNewDraft` distinguishes the two
	// cases that share this one panel (see this component's own
	// docblock); `editOriginalName` is only meaningful when it's false --
	// the field's name at the moment editing started, needed for the PUT
	// URL even after `editName` itself has been changed mid-edit.
	const [ editingIndex, setEditingIndex ] = useState( null );
	const [ isNewDraft, setIsNewDraft ] = useState( false );
	const [ editOriginalName, setEditOriginalName ] = useState( '' );
	const [ editName, setEditName ] = useState( '' );
	const [ editLabel, setEditLabel ] = useState( '' );
	const [ editType, setEditType ] = useState( 'text' );
	const [ editRelationshipMethod, setEditRelationshipMethod ] = useState( '' );
	const [ editChoices, setEditChoices ] = useState( [] );
	const [ editTab, setEditTab ] = useState( 'general' );
	const [ savingEdit, setSavingEdit ] = useState( false );

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
	// *original* type, not the live `editType` state, is what decides
	// whether Name/Type stay locked -- otherwise picking a different type
	// mid-edit would retroactively unlock inputs a relate field's own
	// immutability rule never actually allows changing.
	const editingOriginalField =
		! isNewDraft && null !== editingIndex ? fields[ editingIndex ] : null;
	const editingIsRelate = editingOriginalField
		? Boolean( relationshipTypeFor( editingOriginalField.type ) )
		: false;

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
			setEditRelationshipMethod( '' );
			return;
		}

		const matches = relationships.filter(
			( relationship ) => relationship.type === editRelationshipType
		);

		setEditRelationshipMethod( ( current ) =>
			matches.some( ( relationship ) => relationship.method_name === current )
				? current
				: matches[ 0 ]
				? matches[ 0 ].method_name
				: ''
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editType, relationships, editingIndex ] );

	// A "Choices" tab that just disappeared (the picked type stopped
	// having choices) shouldn't leave the panel sitting on an now-hidden
	// tab -- fall back to General.
	useEffect( () => {
		if ( ! editHasChoices && 'choices' === editTab ) {
			setEditTab( 'general' );
		}
	}, [ editHasChoices, editTab ] );

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
			},
		] );
		setEditingIndex( fields.length );
		setIsNewDraft( true );
		setEditOriginalName( '' );
		setEditName( '' );
		setEditLabel( '' );
		setEditType( 'text' );
		setEditRelationshipMethod( '' );
		setEditChoices( [] );
		setEditTab( 'general' );
	};

	const startEdit = ( field, index ) => {
		setError( '' );
		setEditingIndex( index );
		setIsNewDraft( false );
		setEditOriginalName( field.name );
		setEditName( field.name );
		setEditLabel( field.label );
		setEditType( field.type );
		setEditRelationshipMethod( field.relationship_method || '' );
		setEditChoices( field.choices && field.choices.length > 0 ? field.choices : [] );
		setEditTab( 'general' );
	};

	const cancelEdit = () => {
		if ( isNewDraft ) {
			setFields( ( current ) =>
				current.filter( ( _field, i ) => i !== editingIndex )
			);
		}

		setEditingIndex( null );
		setIsNewDraft( false );
	};

	const handleSaveEdit = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setSavingEdit( true );

		try {
			const body = editRelationshipType
				? {
						relationship_method: editRelationshipMethod,
						type: editType,
						label: editLabel,
				  }
				: { name: editName, label: editLabel, type: editType };

			if ( editHasChoices ) {
				body.choices = editChoices;
			}

			const savedField = isNewDraft
				? await apiFetch( basePath, {
						method: 'POST',
						body: JSON.stringify( body ),
				  } )
				: await apiFetch(
						`${ basePath }/${ encodeURIComponent( editOriginalName ) }`,
						{
							method: 'PUT',
							body: JSON.stringify( body ),
						}
				  );

			setFields( ( current ) =>
				current.map( ( existing, i ) =>
					i === editingIndex ? savedField : existing
				)
			);
			setEditingIndex( null );
			setIsNewDraft( false );
		} catch ( err ) {
			setError( err.message );
		} finally {
			setSavingEdit( false );
		}
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

	const saveDisabled =
		savingEdit ||
		( editRelationshipType ? ! editRelationshipMethod : ! editName.trim() ) ||
		( editHasChoices &&
			0 === editChoices.filter( ( choice ) => choice.trim() ).length );

	const renderEditPanel = () => (
		<div className="gateway-field-editor-edit-panel">
			<div className="nav-tab-wrapper">
				<button
					type="button"
					className={
						'nav-tab' +
						( 'general' === editTab ? ' nav-tab-active' : '' )
					}
					onClick={ () => setEditTab( 'general' ) }
				>
					General
				</button>
				{ editHasChoices && (
					<button
						type="button"
						className={
							'nav-tab' +
							( 'choices' === editTab ? ' nav-tab-active' : '' )
						}
						onClick={ () => setEditTab( 'choices' ) }
					>
						Choices
					</button>
				) }
			</div>
			<form onSubmit={ handleSaveEdit }>
				<div
					hidden={ 'general' !== editTab }
					className="gateway-field-editor-form-grid"
				>
					<label>
						<span>Name</span>
						{ editRelationshipType ? (
							matchingRelationships.length > 0 ? (
								<select
									value={ editRelationshipMethod }
									onChange={ ( event ) =>
										setEditRelationshipMethod(
											event.target.value
										)
									}
								>
									{ matchingRelationships.map(
										( relationship ) => (
											<option
												key={ relationship.method_name }
												value={ relationship.method_name }
											>
												{ relationshipOptionLabel(
													relationship
												) }
											</option>
										)
									) }
								</select>
							) : (
								<span className="description">
									No{ ' ' }
									{ relationshipTypeLabel(
										editRelationshipType
									) }{ ' ' }
									relationships yet -- add one in the
									Relationships tab first.
								</span>
							)
						) : (
							<input
								type="text"
								className="regular-text"
								placeholder="e.g. first_name"
								value={ editName }
								disabled={ editingIsRelate }
								onChange={ ( event ) =>
									setEditName( event.target.value )
								}
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
							value={ editLabel }
							onChange={ ( event ) =>
								setEditLabel( event.target.value )
							}
						/>
					</label>
					<label>
						<span>Type</span>
						<select
							value={ editType }
							disabled={ editingIsRelate }
							onChange={ ( event ) =>
								setEditType( event.target.value )
							}
						>
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
					<div hidden={ 'choices' !== editTab }>
						<ChoicesEditor
							choices={ editChoices }
							onChange={ setEditChoices }
						/>
					</div>
				) }
				<p className="gateway-field-editor-form-actions">
					<button
						type="submit"
						className="button button-primary"
						disabled={ saveDisabled }
					>
						{ savingEdit
							? 'Saving…'
							: isNewDraft
							? 'Add Field'
							: 'Save' }
					</button>{ ' ' }
					<button
						type="button"
						className="button"
						onClick={ cancelEdit }
						disabled={ savingEdit }
					>
						Cancel
					</button>
				</p>
			</form>
		</div>
	);

	return (
		<div className="gateway-field-editor">
			<h3>Fields</h3>
			<p className="description">
				Fields become this model&rsquo;s mass-assignable attributes
				-- each one is a real column on <code>{ modelClass }</code>
				&rsquo;s own table. Adding, editing, or removing one runs a
				migration right away; dragging a row to reorder it
				doesn&rsquo;t.
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
							<th>Name</th>
							<th>Label</th>
							<th>Type</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{ fields.map( ( field, index ) =>
							editingIndex === index ? (
								<tr key={ field.id ?? 'draft' }>
									<td colSpan={ 5 }>
										{ renderEditPanel() }
									</td>
								</tr>
							) : (
								<tr
									key={ field.id }
									draggable={ dragEnabled }
									onDragStart={ handleDragStart(
										field.name
									) }
									onDragOver={
										dragEnabled ? handleDragOver : undefined
									}
									onDrop={
										dragEnabled
											? handleDrop( field.name )
											: undefined
									}
									className={
										draggedName === field.name
											? 'gateway-field-editor-row-dragging'
											: ''
									}
								>
									<td
										className="gateway-field-editor-drag-col"
										title="Drag to reorder"
									>
										⠿
									</td>
									<td>
										<code>{ field.name }</code>
									</td>
									<td>{ field.label }</td>
									<td>
										{ fieldTypes.find(
											( type ) => type.key === field.type
										)?.label || field.type }
									</td>
									<td>
										<button
											type="button"
											className="button"
											onClick={ () =>
												startEdit( field, index )
											}
											disabled={
												null !== editingIndex ||
												null !== deletingName ||
												reordering
											}
										>
											Edit
										</button>
										<button
											type="button"
											className="button"
											onClick={ () =>
												handleDelete( field.name )
											}
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
								</tr>
							)
						) }
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
