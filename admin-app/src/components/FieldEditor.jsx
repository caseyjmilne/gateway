import { useState } from 'react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';

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
 */
export default function FieldEditor( { modelClass, initialFields } ) {
	const fieldTypes = useFieldTypes();
	const [ fields, setFields ] = useState( initialFields || [] );
	const [ error, setError ] = useState( '' );

	const [ newName, setNewName ] = useState( '' );
	const [ newLabel, setNewLabel ] = useState( '' );
	const [ newType, setNewType ] = useState( 'text' );
	const [ adding, setAdding ] = useState( false );

	// The field currently being edited, identified by its existing name
	// (fields don't have a separate id -- name is the identity, both here
	// and as the real column name).
	const [ editingName, setEditingName ] = useState( null );
	const [ editName, setEditName ] = useState( '' );
	const [ editLabel, setEditLabel ] = useState( '' );
	const [ editType, setEditType ] = useState( 'text' );
	const [ savingEdit, setSavingEdit ] = useState( false );

	const [ deletingName, setDeletingName ] = useState( null );

	const [ draggedName, setDraggedName ] = useState( null );
	const [ reordering, setReordering ] = useState( false );

	const basePath = `/models/${ encodeURIComponent( modelClass ) }/fields`;
	const dragEnabled = null === editingName && null === deletingName;

	const handleAdd = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setAdding( true );

		try {
			const field = await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( {
					name: newName,
					label: newLabel,
					type: newType,
				} ),
			} );
			setFields( ( current ) => [ ...current, field ] );
			setNewName( '' );
			setNewLabel( '' );
			setNewType( 'text' );
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
	};

	const cancelEdit = () => setEditingName( null );

	const handleSaveEdit = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setSavingEdit( true );

		try {
			const field = await apiFetch(
				`${ basePath }/${ encodeURIComponent( editingName ) }`,
				{
					method: 'PUT',
					body: JSON.stringify( {
						name: editName,
						label: editLabel,
						type: editType,
					} ),
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
													! editName.trim()
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
				<code>first_name</code> is a <em>name</em>.
			</p>
			<form onSubmit={ handleAdd } className="gateway-field-editor-row">
				<input
					type="text"
					className="regular-text"
					placeholder="e.g. first_name"
					value={ newName }
					onChange={ ( event ) => setNewName( event.target.value ) }
				/>
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
					disabled={ adding || ! newName.trim() }
				>
					{ adding ? 'Adding…' : 'Add Field' }
				</button>
			</form>
		</div>
	);
}
