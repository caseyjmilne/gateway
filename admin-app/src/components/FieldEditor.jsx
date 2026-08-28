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
 * fails.
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
 * created), editing one disables the Name and Type inputs -- only its
 * Label stays editable, same as every other field type.
 *
 * "Buttons"/"Select"/"Radio"/"Checkbox" (any Choice_Field_Type -- each
 * type's own `has_choices` from useFieldTypes()) are a lighter special
 * case: unlike a relate field, everything about the field (name, type,
 * label) stays freely editable -- only one extra thing appears, a
 * ChoicesEditor for the field's own orderable choice list
 * (Gateway\\Model_Field_Choices on the server), required (at least one
 * non-blank choice) whenever the picked type has one. Reordering,
 * adding, or removing a choice is a normal in-place edit, submitted the
 * same way a renamed field or a changed label is -- there's no
 * "immutable once created" rule for choices the way there is for a
 * relate field's own relationship.
 */
export default function FieldEditor( { modelClass, initialFields, relationships = [] } ) {
	const fieldTypes = useFieldTypes();
	const relationshipTypes = useRelationshipTypes();
	const [ fields, setFields ] = useState( initialFields || [] );
	const [ error, setError ] = useState( '' );

	const [ newName, setNewName ] = useState( '' );
	const [ newLabel, setNewLabel ] = useState( '' );
	const [ newType, setNewType ] = useState( 'text' );
	const [ newRelationshipMethod, setNewRelationshipMethod ] = useState( '' );
	const [ newChoices, setNewChoices ] = useState( [] );
	const [ adding, setAdding ] = useState( false );

	// The field currently being edited, identified by its existing name
	// (fields don't have a separate id -- name is the identity, both here
	// and as the real column name).
	const [ editingName, setEditingName ] = useState( null );
	const [ editName, setEditName ] = useState( '' );
	const [ editLabel, setEditLabel ] = useState( '' );
	const [ editType, setEditType ] = useState( 'text' );
	const [ editChoices, setEditChoices ] = useState( [] );
	const [ savingEdit, setSavingEdit ] = useState( false );

	const [ deletingName, setDeletingName ] = useState( null );

	const [ draggedName, setDraggedName ] = useState( null );
	const [ reordering, setReordering ] = useState( false );

	const basePath = `/models/${ encodeURIComponent( modelClass ) }/fields`;
	const dragEnabled = null === editingName && null === deletingName;

	// `relationships` (this model's own) arrives as a prop, owned by
	// ModelDetail and shared with RelationshipEditor -- not fetched here
	// independently. It used to be: FieldEditor fetched its own copy once
	// on mount, so adding a relationship via RelationshipEditor (rendered
	// just below this component, same page, same session) never updated
	// it, leaving the "Relate to One"/"Relate to Many" picker below
	// falsely reporting "No <type> relationships yet" even though one
	// genuinely existed. Sharing one lifted-up state closes that gap
	// entirely -- see ModelDetail's own docblock.

	const relationshipTypeFor = ( typeKey ) =>
		fieldTypes.find( ( type ) => type.key === typeKey )?.relationship_type ||
		null;

	const relationshipTypeLabel = ( key ) =>
		relationshipTypes.find( ( type ) => type.key === key )?.label || key;

	const hasChoicesFor = ( typeKey ) =>
		Boolean( fieldTypes.find( ( type ) => type.key === typeKey )?.has_choices );

	const newRelationshipType = relationshipTypeFor( newType );
	const newHasChoices = hasChoicesFor( newType );
	const editHasChoices = hasChoicesFor( editType );
	const matchingRelationships = newRelationshipType
		? relationships.filter(
				( relationship ) => relationship.type === newRelationshipType
		  )
		: [];

	// Whenever the picked type changes, default (or clear) the relationship
	// dropdown to match -- a relationship chosen for a different type no
	// longer makes sense once the type itself has changed.
	useEffect( () => {
		if ( ! newRelationshipType ) {
			setNewRelationshipMethod( '' );
			return;
		}

		const matches = relationships.filter(
			( relationship ) => relationship.type === newRelationshipType
		);
		setNewRelationshipMethod( matches[ 0 ] ? matches[ 0 ].method_name : '' );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ newType, relationships ] );

	// A blank first row is a convenience, not a requirement -- ChoicesEditor
	// itself renders an "Add Choice" button either way. Only seeds one when
	// there's nothing there yet, so switching between two choice types
	// (Select -> Radio, say) never discards whatever the site owner already
	// typed.
	useEffect( () => {
		if ( newHasChoices ) {
			setNewChoices( ( current ) => ( current.length > 0 ? current : [ '' ] ) );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ newType ] );

	useEffect( () => {
		if ( editHasChoices ) {
			setEditChoices( ( current ) => ( current.length > 0 ? current : [ '' ] ) );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editType ] );

	const relationshipOptionLabel = ( relationship ) =>
		`${ relationship.related_model } (${ relationship.method_name }())`;

	const handleAdd = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setAdding( true );

		try {
			const body = newRelationshipType
				? {
						relationship_method: newRelationshipMethod,
						type: newType,
						label: newLabel,
				  }
				: { name: newName, label: newLabel, type: newType };

			if ( newHasChoices ) {
				body.choices = newChoices;
			}

			const field = await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( body ),
			} );
			setFields( ( current ) => [ ...current, field ] );
			setNewName( '' );
			setNewLabel( '' );
			setNewType( 'text' );
			setNewRelationshipMethod( '' );
			setNewChoices( [] );
		} catch ( err ) {
			setError( err.message );
		} finally {
			setAdding( false );
		}
	};

	const startEdit = ( field ) => {
		setError( '' );
		setEditingName( field.name );
		setEditName( field.name );
		setEditLabel( field.label );
		setEditType( field.type );
		setEditChoices( field.choices && field.choices.length > 0 ? field.choices : [] );
	};

	const cancelEdit = () => setEditingName( null );

	const editingField = editingName
		? fields.find( ( field ) => field.name === editingName )
		: null;
	const editingIsRelate = editingField
		? Boolean( relationshipTypeFor( editingField.type ) )
		: false;

	const handleSaveEdit = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setSavingEdit( true );

		try {
			const body = {
				name: editName,
				label: editLabel,
				type: editType,
			};

			if ( editHasChoices ) {
				body.choices = editChoices;
			}

			const field = await apiFetch(
				`${ basePath }/${ encodeURIComponent( editingName ) }`,
				{
					method: 'PUT',
					body: JSON.stringify( body ),
				}
			);
			setFields( ( current ) =>
				current.map( ( existing ) =>
					existing.name === editingName ? field : existing
				)
			);
			setEditingName( null );
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
						{ fields.map( ( field ) =>
							editingName === field.name ? (
								<tr key={ field.name }>
									<td colSpan={ 5 }>
										<form
											onSubmit={ handleSaveEdit }
											className="gateway-field-editor-row"
										>
											<input
												type="text"
												className="regular-text"
												placeholder="Name"
												value={ editName }
												disabled={ editingIsRelate }
												onChange={ ( event ) =>
													setEditName(
														event.target.value
													)
												}
											/>
											<input
												type="text"
												className="regular-text"
												placeholder="Label"
												value={ editLabel }
												onChange={ ( event ) =>
													setEditLabel(
														event.target.value
													)
												}
											/>
											<select
												value={ editType }
												disabled={ editingIsRelate }
												onChange={ ( event ) =>
													setEditType(
														event.target.value
													)
												}
											>
												{ fieldTypes.map( ( type ) => (
													<option
														key={ type.key }
														value={ type.key }
													>
														{ type.label }
													</option>
												) ) }
											</select>
											<button
												type="submit"
												className="button button-primary"
												disabled={
													savingEdit ||
													! editName.trim() ||
													( editHasChoices &&
														0 ===
															editChoices.filter(
																( choice ) =>
																	choice.trim()
															).length )
												}
											>
												{ savingEdit
													? 'Saving…'
													: 'Save' }
											</button>
											<button
												type="button"
												className="button"
												onClick={ cancelEdit }
												disabled={ savingEdit }
											>
												Cancel
											</button>
										</form>
										{ editingIsRelate && (
											<p className="description">
												This field&rsquo;s
												relationship can&rsquo;t be
												changed -- remove it and add a
												new one instead if it needs to
												point somewhere else.
											</p>
										) }
										{ editHasChoices && (
											<ChoicesEditor
												choices={ editChoices }
												onChange={ setEditChoices }
											/>
										) }
									</td>
								</tr>
							) : (
								<tr
									key={ field.name }
									draggable={ dragEnabled }
									onDragStart={ handleDragStart(
										field.name
									) }
									onDragOver={ dragEnabled ? handleDragOver : undefined }
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
											onClick={ () => startEdit( field ) }
											disabled={
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

			<h4>Add Field</h4>
			<p className="description">
				Name must be unique on this model and is always stored
				lowercase (it becomes the real column name) --{ ' ' }
				<code>First Name</code> is a <em>label</em>;{ ' ' }
				<code>first_name</code> is a <em>name</em>.{ ' ' }
				Picking &ldquo;Relate to One&rdquo; or &ldquo;Relate to
				Many&rdquo; below replaces this with a relationship picker
				instead -- the field&rsquo;s real name is derived from the
				relationship you choose.
			</p>
			<form onSubmit={ handleAdd } className="gateway-field-editor-row">
				{ newRelationshipType ? (
					matchingRelationships.length > 0 ? (
						<select
							value={ newRelationshipMethod }
							onChange={ ( event ) =>
								setNewRelationshipMethod( event.target.value )
							}
						>
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
						<p className="description">
							No { relationshipTypeLabel( newRelationshipType ) }{ ' ' }
							relationships yet -- add one in the Relationships
							section below first.
						</p>
					)
				) : (
					<input
						type="text"
						className="regular-text"
						placeholder="e.g. first_name"
						value={ newName }
						onChange={ ( event ) => setNewName( event.target.value ) }
					/>
				) }
				<input
					type="text"
					className="regular-text"
					placeholder="Label (optional)"
					value={ newLabel }
					onChange={ ( event ) => setNewLabel( event.target.value ) }
				/>
				<select
					value={ newType }
					onChange={ ( event ) => setNewType( event.target.value ) }
				>
					{ fieldTypes.map( ( type ) => (
						<option key={ type.key } value={ type.key }>
							{ type.label }
						</option>
					) ) }
				</select>
				<button
					type="submit"
					className="button button-primary"
					disabled={
						adding ||
						( newRelationshipType
							? ! newRelationshipMethod
							: ! newName.trim() ) ||
						( newHasChoices &&
							0 ===
								newChoices.filter( ( choice ) => choice.trim() )
									.length )
					}
				>
					{ adding ? 'Adding…' : 'Add Field' }
				</button>
				{ newHasChoices && (
					<ChoicesEditor
						choices={ newChoices }
						onChange={ setNewChoices }
					/>
				) }
			</form>
		</div>
	);
}
