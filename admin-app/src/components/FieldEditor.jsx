import { useState } from 'react';
import { apiFetch } from '../api.js';

const FIELD_TYPES = [
	{ value: 'text', label: 'Text' },
	{ value: 'number', label: 'Number' },
];

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
 */
export default function FieldEditor( { modelClass, initialFields } ) {
	const [ fields, setFields ] = useState( initialFields || [] );
	const [ error, setError ] = useState( '' );

	const [ newName, setNewName ] = useState( '' );
	const [ newType, setNewType ] = useState( 'text' );
	const [ adding, setAdding ] = useState( false );

	// The field currently being edited, identified by its existing name
	// (fields don't have a separate id -- name is the identity, both here
	// and as the real column name).
	const [ editingName, setEditingName ] = useState( null );
	const [ editName, setEditName ] = useState( '' );
	const [ editType, setEditType ] = useState( 'text' );
	const [ savingEdit, setSavingEdit ] = useState( false );

	const [ deletingName, setDeletingName ] = useState( null );

	const basePath = `/models/${ encodeURIComponent( modelClass ) }/fields`;

	const handleAdd = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setAdding( true );

		try {
			const field = await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( { name: newName, type: newType } ),
			} );
			setFields( ( current ) => [ ...current, field ] );
			setNewName( '' );
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
					body: JSON.stringify( { name: editName, type: editType } ),
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

	return (
		<div className="gateway-field-editor">
			<h3>Fields</h3>
			<p className="description">
				Fields become this model&rsquo;s mass-assignable attributes
				-- each one is a real column on <code>{ modelClass }</code>
				&rsquo;s own table. Adding, editing, or removing one runs a
				migration right away.
			</p>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ fields.length === 0 ? (
				<p className="description">No fields yet.</p>
			) : (
				<table className="widefat striped">
					<thead>
						<tr>
							<th>Name</th>
							<th>Type</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{ fields.map( ( field ) =>
							editingName === field.name ? (
								<tr key={ field.name }>
									<td colSpan={ 3 }>
										<form
											onSubmit={ handleSaveEdit }
											className="gateway-field-editor-row"
										>
											<input
												type="text"
												className="regular-text"
												value={ editName }
												onChange={ ( event ) =>
													setEditName(
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
												{ FIELD_TYPES.map( ( type ) => (
													<option
														key={ type.value }
														value={ type.value }
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
								<tr key={ field.name }>
									<td>
										<code>{ field.name }</code>
									</td>
									<td>
										{ FIELD_TYPES.find(
											( type ) => type.value === field.type
										)?.label || field.type }
									</td>
									<td>
										<button
											type="button"
											className="button"
											onClick={ () => startEdit( field ) }
											disabled={
												null !== deletingName
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
												deletingName === field.name
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
			<form onSubmit={ handleAdd } className="gateway-field-editor-row">
				<input
					type="text"
					className="regular-text"
					placeholder="e.g. First Name"
					value={ newName }
					onChange={ ( event ) => setNewName( event.target.value ) }
				/>
				<select
					value={ newType }
					onChange={ ( event ) => setNewType( event.target.value ) }
				>
					{ FIELD_TYPES.map( ( type ) => (
						<option key={ type.value } value={ type.value }>
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
