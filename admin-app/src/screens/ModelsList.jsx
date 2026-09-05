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

// Gateway\Model_Builder::TYPE_CONTENT_TYPE/TYPE_DATA_MODEL's own values --
// a fixed, two-option vocabulary (not fetched from the server the way
// Field Type/Relationship Type are -- there's no reasonable way a future
// plugin or filter would add a third kind of model the way it might add a
// new field type), so hardcoded here rather than round-tripped through
// its own REST route for two static strings.
const MODEL_TYPES = [
	{
		value: 'content_type',
		label: 'Content Type',
		description:
			'Comes with a required Title field and a Permalink field tracking it, ready for records that each need their own page.',
	},
	{
		value: 'data_model',
		label: 'Data Model',
		description:
			'Starts blank (just an internal id and timestamps) -- add whatever fields you need. The right choice for a lookup table, a join table, or anything with no single visitor-facing page of its own.',
	},
];

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
 *
 * **Type** (`MODEL_TYPES` above -- Gateway\Model_Builder's own
 * `TYPE_CONTENT_TYPE`/`TYPE_DATA_MODEL`) is a one-time choice, only ever
 * made HERE: a `<select>` on this create form, defaulting to Content
 * Type (the more commonly wanted "give this a page of its own" shape).
 * `Model_Builder::create()` records it permanently the moment the model
 * is created, and there's no way to change it afterward -- `ModelDetail`'s
 * own General tab shows it as a plain static label once a model exists,
 * never a control of its own (see that screen's own docblock for why:
 * there's no sensible migration path either direction once fields may
 * already have been added by hand). Choosing Content Type doesn't just
 * record the choice -- the server also seeds a real `title` (Text) field
 * and a `permalink` (Permalink) field tracking it, the same two things a
 * site owner would otherwise have to remember to add by hand every time.
 */
export default function ModelsList() {
	const [ showCreateForm, setShowCreateForm ] = useState( false );
	const [ title, setTitle ] = useState( '' );
	const [ pluralTitle, setPluralTitle ] = useState( '' );
	const [ type, setType ] = useState( 'content_type' );
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
		setType( 'content_type' );
	};

	const handleSubmit = async ( event ) => {
		event.preventDefault();
		setSubmitting( true );
		setCreateError( '' );

		try {
			const data = await apiFetch( '/models', {
				method: 'POST',
				body: JSON.stringify( { title, plural_title: pluralTitle, type } ),
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
										<label htmlFor="gateway-model-type">
											Type
										</label>
									</th>
									<td>
										<select
											id="gateway-model-type"
											className="regular-text"
											value={ type }
											onChange={ ( event ) =>
												setType( event.target.value )
											}
										>
											{ MODEL_TYPES.map( ( option ) => (
												<option
													key={ option.value }
													value={ option.value }
												>
													{ option.label }
												</option>
											) ) }
										</select>
										<p className="description">
											{
												MODEL_TYPES.find(
													( option ) => option.value === type
												).description
											}
										</p>
										<p className="description">
											This can&rsquo;t be changed once
											the model is created.
										</p>
									</td>
								</tr>
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
									<Link to={ `/models/${ model.slug }` }>
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
