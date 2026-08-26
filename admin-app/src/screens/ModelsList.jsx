import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';

/**
 * The Models home screen: a form that turns a single "Title" into a real
 * Eloquent model + migration (see Model_Builder on the PHP side -- the
 * migration runs immediately, so the table exists by the time this form
 * reports success), plus the list of models that already exist, each
 * linking to its own detail route.
 */
export default function ModelsList() {
	const [ title, setTitle ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );
	const [ result, setResult ] = useState( null );

	const [ models, setModels ] = useState( [] );
	const [ loadingModels, setLoadingModels ] = useState( true );
	const [ loadError, setLoadError ] = useState( '' );

	const loadModels = useCallback( async () => {
		setLoadingModels( true );
		setLoadError( '' );

		try {
			const data = await apiFetch( '/models' );
			setModels( data );
		} catch ( error ) {
			setLoadError( error.message );
		} finally {
			setLoadingModels( false );
		}
	}, [] );

	useEffect( () => {
		loadModels();
	}, [ loadModels ] );

	const handleSubmit = async ( event ) => {
		event.preventDefault();
		setSubmitting( true );
		setResult( null );

		try {
			const data = await apiFetch( '/models', {
				method: 'POST',
				body: JSON.stringify( { title } ),
			} );
			setResult( { success: true, ...data } );
			setTitle( '' );
			loadModels();
		} catch ( error ) {
			setResult( { success: false, message: error.message } );
		} finally {
			setSubmitting( false );
		}
	};

	return (
		<div className="gateway-models">
			<h2>Models</h2>
			<p className="description">
				Adding a model creates both an Eloquent model class and a
				first migration for it -- the migration runs immediately,
				creating the database table, so the model is ready to use
				as soon as it&rsquo;s added.
			</p>

			<form onSubmit={ handleSubmit }>
				<table className="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-model-title">
									Title
								</label>
							</th>
							<td>
								<input
									id="gateway-model-title"
									type="text"
									className="regular-text"
									value={ title }
									onChange={ ( event ) =>
										setTitle( event.target.value )
									}
									placeholder="e.g. Blog Post"
								/>
								<p className="description">
									Becomes the model&rsquo;s class name and
									database table -- e.g. &ldquo;Blog
									Post&rdquo; &rarr; class{ ' ' }
									<code>BlogPost</code>, table{ ' ' }
									<code>blog_posts</code>.
								</p>
							</td>
						</tr>
					</tbody>
				</table>
				<p>
					<button
						type="submit"
						className="button button-primary"
						disabled={ submitting || ! title.trim() }
					>
						{ submitting ? 'Creating…' : 'Create Model' }
					</button>
				</p>
			</form>

			{ result && (
				<div
					className={ `notice ${
						result.success ? 'notice-success' : 'notice-error'
					}` }
				>
					<p>
						{ result.success
							? `Created "${ result.class }" -- table "${ result.table }" created (migration v${ result.migration_version }).`
							: result.message }
					</p>
				</div>
			) }

			<h3>Existing models</h3>

			{ loadError && (
				<div className="notice notice-error">
					<p>{ loadError }</p>
				</div>
			) }

			{ loadingModels ? (
				<p>Loading…</p>
			) : models.length === 0 ? (
				<p className="description">No models yet.</p>
			) : (
				<table className="widefat striped">
					<thead>
						<tr>
							<th>Model</th>
							<th>Table</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						{ models.map( ( model ) => (
							<tr key={ model.class }>
								<td>
									<Link to={ `/models/${ model.class }` }>
										<code>{ model.class }</code>
									</Link>
								</td>
								<td>
									<code>{ model.table }</code>
								</td>
								<td>
									{ model.migration &&
									model.migration.has_run
										? '✅ Ready'
										: '⚠️ Migration not run' }
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }
		</div>
	);
}
