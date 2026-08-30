import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import Modal from '../components/Modal.jsx';

// Everything BUT letters/digits/underscores is stripped from Title as it's
// typed -- see this screen's own docblock for why. Applied on every
// keystroke (and to a paste, which fires the same onChange) rather than
// only at submit time, so what's in the input is always already exactly
// what will become the model's own class name, never something that
// silently gets rewritten out from under whoever's typing it.
const sanitizeTitleInput = ( raw ) => raw.replace( /[^A-Za-z0-9_]/g, '' );

/**
 * The Models home screen: a "Create Model" button opens a modal form that
 * turns "Title" into a real Eloquent model + migration (see Model_Builder
 * on the PHP side -- the migration runs immediately, so the table exists
 * by the time this form reports success), plus the list of models that
 * already exist, each linking to its own detail route.
 *
 * The create form used to sit inline, always visible above the list --
 * moved into a `Modal` (the same one RecordsCrud's own "Add New"/"Edit"
 * already use) so this screen reads as "a list, with an action to add to
 * it" rather than a form permanently taking up space above a list that,
 * on a site with many models, could otherwise start well below the fold.
 *
 * Title is deliberately restricted to letters/digits/underscores as
 * you type -- no spaces, hyphens, or other punctuation ever make it into
 * the field at all (`sanitizeTitleInput()`, run on every keystroke).
 * `Model_Builder::class_name_from_title()` on the server actually
 * tolerates a space/hyphen too (treating either as a word break the same
 * way an underscore is, e.g. "Vehicle Makes" already studly-cases to
 * "VehicleMakes" there), so this isn't papering over something the
 * server would otherwise reject -- it's making the input ITSELF
 * unambiguous about what a model's name can be: a real PHP identifier
 * fragment, typed as either `VehicleMakes` or `Vehicle_Makes`, never
 * something that only LOOKS like a title ("Vehicle Makes") and quietly
 * becomes something else by the time it's saved.
 *
 * Plural Title is a separate, optional field -- a display label only
 * (e.g. for a future list heading); it never affects the class or table
 * name, which always come from Title alone, so it keeps its own free
 * -text input, unrestricted.
 */
export default function ModelsList() {
	const [ showCreateForm, setShowCreateForm ] = useState( false );
	const [ title, setTitle ] = useState( '' );
	const [ pluralTitle, setPluralTitle ] = useState( '' );
	const [ submitting, setSubmitting ] = useState( false );
	const [ createError, setCreateError ] = useState( '' );
	const [ justCreated, setJustCreated ] = useState( null );

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

	const closeCreateForm = () => {
		setShowCreateForm( false );
		setCreateError( '' );
		setTitle( '' );
		setPluralTitle( '' );
	};

	const handleSubmit = async ( event ) => {
		event.preventDefault();
		setSubmitting( true );
		setCreateError( '' );

		try {
			const data = await apiFetch( '/models', {
				method: 'POST',
				body: JSON.stringify( { title, plural_title: pluralTitle } ),
			} );
			setJustCreated( data );
			closeCreateForm();
			loadModels();
		} catch ( error ) {
			setCreateError( error.message );
		} finally {
			setSubmitting( false );
		}
	};

	return (
		<div className="gateway-models">
			<h2>Models</h2>

			<p>
				<button
					type="button"
					className="button button-primary"
					onClick={ () => setShowCreateForm( true ) }
				>
					Create Model
				</button>
			</p>

			{ justCreated && (
				<div className="notice notice-success">
					<p>
						{ `Created "${ justCreated.class }" -- table "${ justCreated.table }" created (migration v${ justCreated.migration_version }).` }
					</p>
				</div>
			) }

			{ showCreateForm && (
				<Modal title="Create Model" onClose={ closeCreateForm }>
					<p className="description">
						Adding a model creates both an Eloquent model class
						and a first migration for it -- the migration runs
						immediately, creating the database table, so the
						model is ready to use as soon as it&rsquo;s added.
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
												setTitle(
													sanitizeTitleInput(
														event.target.value
													)
												)
											}
											placeholder="e.g. VehicleMakes or Vehicle_Makes"
										/>
										<p className="description">
											Letters, digits, and underscores
											only -- no spaces (they&rsquo;re
											silently dropped as you type).
											Becomes the model&rsquo;s class
											name and database table -- e.g.{ ' ' }
											<code>VehicleMakes</code> or{ ' ' }
											<code>Vehicle_Makes</code> &rarr;
											class{ ' ' }
											<code>VehicleMakes</code>, table{ ' ' }
											<code>vehicle_makes</code>.
										</p>
									</td>
								</tr>
								<tr>
									<th scope="row">
										<label htmlFor="gateway-model-plural-title">
											Plural Title
										</label>
									</th>
									<td>
										<input
											id="gateway-model-plural-title"
											type="text"
											className="regular-text"
											value={ pluralTitle }
											onChange={ ( event ) =>
												setPluralTitle(
													event.target.value
												)
											}
											placeholder="e.g. Vehicle Makes"
										/>
										<p className="description">
											Optional -- a friendly plural
											label (e.g. for a future list
											heading), free text. Doesn&rsquo;t
											affect the class or table name,
											which always come from Title
											alone.
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

					{ createError && (
						<div className="notice notice-error">
							<p>{ createError }</p>
						</div>
					) }
				</Modal>
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
