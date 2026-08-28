import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import useRelationshipTypes from '../hooks/useRelationshipTypes.js';

/**
 * A small field-editor-style Relationship Editor for one model: pick
 * another model, pick a relationship type, Add -- backed by
 * Gateway\Model_Relationships via /gateway/v1/models/<class>/relationships.
 *
 * Unlike FieldEditor, there's no name (or label) to type in at all --
 * the relationship's method name is derived automatically from the
 * related model's own class name and the relationship type's plurality
 * (e.g. relating to "Model" via "Belongs To" always becomes `model()`;
 * via "Has Many", `models()`), by Model_Relationships itself, so the
 * only real decisions here are *which* model and *what kind* of
 * relationship. There's also no Edit -- "editing" a relationship is
 * really just removing it and adding a different one, since everything
 * about it (including its method name) follows from those same two
 * choices.
 *
 * Every relationship here is a real, callable method printed into the
 * model's own .php file (see Model_Relationships/Model_Builder on the
 * PHP side) -- but unlike a field, adding or removing one never touches
 * the database schema: there's no column, so no migration ever runs.
 *
 * `relationships`/`onRelationshipsChange` are a controlled pair, owned
 * by ModelDetail (the parent) rather than local state here -- FieldEditor
 * needs this exact same list (for its own "Relate to One"/"Relate to
 * Many" relationship picker) to update the moment this component adds
 * or removes one, not just whenever FieldEditor next happens to refetch
 * it independently. See ModelDetail's own docblock for the bug this
 * fixes.
 */
export default function RelationshipEditor( { modelClass, relationships, onRelationshipsChange } ) {
	const relationshipTypes = useRelationshipTypes();
	const [ error, setError ] = useState( '' );

	const [ otherModels, setOtherModels ] = useState( [] );
	const [ loadingModels, setLoadingModels ] = useState( true );

	const [ newRelatedModel, setNewRelatedModel ] = useState( '' );
	const [ newType, setNewType ] = useState( '' );
	const [ adding, setAdding ] = useState( false );

	const [ deletingMethodName, setDeletingMethodName ] = useState( null );

	const basePath = `/models/${ encodeURIComponent( modelClass ) }/relationships`;

	// Every *other* registered model -- what the "related model" dropdown
	// offers. Reuses GET /models (the same endpoint the Models/Records
	// list screens already use) rather than a separate endpoint just for
	// this list.
	useEffect( () => {
		let cancelled = false;
		setLoadingModels( true );

		apiFetch( '/models' )
			.then( ( data ) => {
				if ( cancelled ) {
					return;
				}
				const others = data.filter(
					( model ) => model.class !== modelClass
				);
				setOtherModels( others );
				setNewRelatedModel( ( current ) =>
					current || ( others[ 0 ] ? others[ 0 ].class : '' )
				);
			} )
			.catch( () => {} )
			.finally( () => {
				if ( ! cancelled ) {
					setLoadingModels( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ modelClass ] );

	useEffect( () => {
		if ( ! newType && relationshipTypes[ 0 ] ) {
			setNewType( relationshipTypes[ 0 ].key );
		}
	}, [ relationshipTypes, newType ] );

	const typeLabel = ( key ) =>
		relationshipTypes.find( ( type ) => type.key === key )?.label || key;

	const modelLabel = ( className ) => {
		const found = otherModels.find( ( model ) => model.class === className );
		return found && found.plural_title ? found.plural_title : className;
	};

	const handleAdd = async ( event ) => {
		event.preventDefault();
		setError( '' );
		setAdding( true );

		try {
			const relationship = await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( {
					related_model: newRelatedModel,
					type: newType,
				} ),
			} );
			onRelationshipsChange( ( current ) => [ ...current, relationship ] );
		} catch ( err ) {
			setError( err.message );
		} finally {
			setAdding( false );
		}
	};

	const handleDelete = async ( methodName ) => {
		setError( '' );
		setDeletingMethodName( methodName );

		try {
			await apiFetch(
				`${ basePath }/${ encodeURIComponent( methodName ) }`,
				{ method: 'DELETE' }
			);
			onRelationshipsChange( ( current ) =>
				current.filter(
					( relationship ) => relationship.method_name !== methodName
				)
			);
		} catch ( err ) {
			setError( err.message );
		} finally {
			setDeletingMethodName( null );
		}
	};

	return (
		<div className="gateway-relationship-editor">
			<h3>Relationships</h3>
			<p className="description">
				Relate <code>{ modelClass }</code> to another model --
				each one becomes a real, callable method on{ ' ' }
				<code>{ modelClass }</code>&rsquo;s own model file, named
				automatically from the model and type you pick. Unlike
				fields, adding or removing one never touches the database
				schema.
			</p>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ relationships.length === 0 ? (
				<p className="description">No relationships yet.</p>
			) : (
				<table className="widefat striped">
					<thead>
						<tr>
							<th>Related Model</th>
							<th>Type</th>
							<th>Method</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{ relationships.map( ( relationship ) => (
							<tr key={ relationship.method_name }>
								<td>
									<code>
										{ relationship.related_model }
									</code>
								</td>
								<td>{ typeLabel( relationship.type ) }</td>
								<td>
									<code>
										{ relationship.method_name }()
									</code>
								</td>
								<td>
									<button
										type="button"
										className="button"
										onClick={ () =>
											handleDelete(
												relationship.method_name
											)
										}
										disabled={
											deletingMethodName ===
											relationship.method_name
										}
									>
										{ deletingMethodName ===
										relationship.method_name
											? 'Deleting…'
											: 'Delete' }
									</button>
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }

			<h4>Add Relationship</h4>

			{ loadingModels ? (
				<p>Loading…</p>
			) : otherModels.length === 0 ? (
				<p className="description">
					No other models yet -- create at least one more model
					to relate this one to.
				</p>
			) : (
				<form
					onSubmit={ handleAdd }
					className="gateway-field-editor-row"
				>
					<select
						value={ newRelatedModel }
						onChange={ ( event ) =>
							setNewRelatedModel( event.target.value )
						}
					>
						{ otherModels.map( ( model ) => (
							<option key={ model.class } value={ model.class }>
								{ modelLabel( model.class ) }
							</option>
						) ) }
					</select>
					<select
						value={ newType }
						onChange={ ( event ) =>
							setNewType( event.target.value )
						}
					>
						{ relationshipTypes.map( ( type ) => (
							<option key={ type.key } value={ type.key }>
								{ type.label }
							</option>
						) ) }
					</select>
					<button
						type="submit"
						className="button button-primary"
						disabled={ adding || ! newRelatedModel || ! newType }
					>
						{ adding ? 'Adding…' : 'Add Relationship' }
					</button>
				</form>
			) }
		</div>
	);
}
