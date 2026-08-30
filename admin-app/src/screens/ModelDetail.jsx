import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import FieldEditor from '../components/FieldEditor.jsx';
import RelationshipEditor from '../components/RelationshipEditor.jsx';

/**
 * Single-model detail view -- shows what's known about one registered
 * model (its table, and its migration's version + whether it has actually
 * run), lets its Title and Plural Title be changed, and hosts its own
 * Fields/Relationships editors, all three behind one text-based tab strip:
 * **General** (Title/Plural Title/Table/Migration/Status), **Fields**
 * (`FieldEditor`), **Relationships** (`RelationshipEditor`). The same
 * `.gateway-subtab`/`.gateway-subtab-active` classes `FieldEditor`'s own
 * inner General/Validation/Presentation/Conditional Logic tabs already
 * use, not a second, visually-different tab style of this page's own --
 * before this, General's own content (Title/Plural Title/Table/Migration/
 * Status) sat permanently visible above a SEPARATE, differently-styled
 * `nav-tab`/`nav-tab-active` (WordPress core's own boxed look) strip for
 * just Fields/Relationships; now every section is a tab, all three
 * sharing one consistent look.
 *
 * Title alone drives naming (the class and table names) -- see
 * Model_Builder's own docblock. Plural Title is just a stored display
 * label with no effect on either, so editing it alone is a plain,
 * non-destructive save: no confirmation, no table touched. Editing Title
 * is different -- it always creates a new model/table and drops the old
 * one (Model_Builder::rename()), so saving a Title change asks for
 * confirmation inline on this page first (never a native window.confirm()
 * popup).
 *
 * Neither field's raw original text is stored anywhere on the PHP side
 * beyond what actually matters: Title is pre-filled from the model's own
 * class name (the only thing Model_Builder persists for it), Plural
 * Title from its own stored label (blank if none was ever set).
 */
export default function ModelDetail() {
	const { className } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const renameNotice = location.state && location.state.renamed ? location.state : null;

	const [ model, setModel ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ loadError, setLoadError ] = useState( '' );

	const [ title, setTitle ] = useState( '' );
	const [ pluralTitle, setPluralTitle ] = useState( '' );
	const [ confirming, setConfirming ] = useState( false );
	const [ saving, setSaving ] = useState( false );
	const [ saveResult, setSaveResult ] = useState( null );

	// Owned HERE, not inside FieldEditor/RelationshipEditor themselves, and
	// passed down to both as a controlled prop + shared setter -- FieldEditor's
	// own "Relate to One"/"Relate to Many" picker needs this model's
	// CURRENT relationships to build its own dropdown from, and if each
	// component fetched/owned its own separate copy, adding a relationship
	// via RelationshipEditor would leave FieldEditor's own copy stale until
	// a full page reload (a real bug, reported directly: "even when a
	// relationship exists this error appears" -- it existed in the
	// database and in RelationshipEditor's own state, just not yet in
	// FieldEditor's, since nothing ever told it to refetch). One shared
	// state, updated the moment either component changes it, closes that
	// window entirely.
	const [ relationships, setRelationships ] = useState( [] );

	// Which of General/Fields/Relationships is showing -- General's own
	// Title/Plural Title form, FieldEditor, and RelationshipEditor all stay
	// mounted the whole time (see the `hidden` attribute below, not
	// conditional rendering), so switching tabs never loses an in-progress
	// edit in any of the other two, and none of them ever needs to re-fetch
	// (or, for General, re-type) on switching back. Defaults to 'general' --
	// the same section that used to just be the top of the page, unconditionally
	// visible, before every section here became a tab.
	const [ activeTab, setActiveTab ] = useState( 'general' );

	useEffect( () => {
		let cancelled = false;

		setLoading( true );
		setLoadError( '' );
		setModel( null );
		setSaveResult( null );
		setConfirming( false );

		apiFetch( `/models/${ encodeURIComponent( className ) }` )
			.then( ( data ) => {
				if ( cancelled ) {
					return;
				}
				setModel( data );
				setTitle( data.class );
				setPluralTitle( data.plural_title || '' );
				setRelationships( data.relationships || [] );
			} )
			.catch( ( error ) => {
				if ( ! cancelled ) {
					setLoadError( error.message );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setLoading( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ className ] );

	const titleChanged = model && title.trim() !== model.class;
	const pluralTitleChanged =
		model && pluralTitle.trim() !== ( model.plural_title || '' );
	const unchanged = model && ! titleChanged && ! pluralTitleChanged;

	const handleFieldChange = ( setter ) => ( event ) => {
		setter( event.target.value );
		setConfirming( false );
	};

	const performSave = async () => {
		setConfirming( false );
		setSaving( true );
		setSaveResult( null );

		try {
			const data = await apiFetch(
				`/models/${ encodeURIComponent( className ) }`,
				{
					method: 'PUT',
					body: JSON.stringify( {
						title,
						plural_title: pluralTitle,
					} ),
				}
			);
			// The class name (and therefore this page's own URL) may have
			// changed -- navigate to wherever the model actually lives now
			// rather than staying on a route that no longer resolves. A
			// Plural-Title-only save lands back on this same route.
			navigate( `/models/${ data.class }`, {
				replace: true,
				state: { renamed: true, warnings: data.warnings || [] },
			} );
		} catch ( error ) {
			setSaveResult( { success: false, message: error.message } );
		} finally {
			setSaving( false );
		}
	};

	const handleSubmit = ( event ) => {
		event.preventDefault();

		if ( unchanged ) {
			return;
		}

		setSaveResult( null );

		if ( titleChanged ) {
			// Recreates the model/table and drops the old one -- confirm
			// first, inline on the page.
			setConfirming( true );
		} else {
			// Plural Title only -- a plain label update, nothing
			// destructive, no confirmation needed.
			performSave();
		}
	};

	return (
		<div className="gateway-model-detail">
			<p>
				<Link to="/">&larr; Back to Models</Link>
			</p>

			{ loading && <p>Loading…</p> }

			{ loadError && (
				<div className="notice notice-error">
					<p>{ loadError }</p>
				</div>
			) }

			{ renameNotice && (
				<div className="notice notice-success">
					<p>Saved.</p>
					{ renameNotice.warnings.map( ( warning, index ) => (
						<p key={ index }>⚠️ { warning }</p>
					) ) }
				</div>
			) }

			{ model && (
				<>
					<h2>
						<code>{ model.class }</code>
					</h2>

					<div className="gateway-subtabs">
						<button
							type="button"
							className={
								'gateway-subtab' +
								( 'general' === activeTab
									? ' gateway-subtab-active'
									: '' )
							}
							onClick={ () => setActiveTab( 'general' ) }
						>
							General
						</button>
						<button
							type="button"
							className={
								'gateway-subtab' +
								( 'fields' === activeTab
									? ' gateway-subtab-active'
									: '' )
							}
							onClick={ () => setActiveTab( 'fields' ) }
						>
							Fields
						</button>
						<button
							type="button"
							className={
								'gateway-subtab' +
								( 'relationships' === activeTab
									? ' gateway-subtab-active'
									: '' )
							}
							onClick={ () => setActiveTab( 'relationships' ) }
						>
							Relationships
						</button>
					</div>

					<div hidden={ 'general' !== activeTab }>
						<form onSubmit={ handleSubmit }>
							<table className="form-table" role="presentation">
								<tbody>
									<tr>
										<th scope="row">
											<label htmlFor="gateway-model-edit-title">
												Title
											</label>
										</th>
										<td>
											<input
												id="gateway-model-edit-title"
												type="text"
												className="regular-text"
												value={ title }
												onChange={ handleFieldChange(
													setTitle
												) }
											/>
											<p className="description">
												Changing this creates a new model
												and table under the new name, and
												permanently deletes the current
												one (including its data).
											</p>
										</td>
									</tr>
									<tr>
										<th scope="row">
											<label htmlFor="gateway-model-edit-plural-title">
												Plural Title
											</label>
										</th>
										<td>
											<input
												id="gateway-model-edit-plural-title"
												type="text"
												className="regular-text"
												value={ pluralTitle }
												onChange={ handleFieldChange(
													setPluralTitle
												) }
											/>
											<p className="description">
												Optional display label -- doesn
												&rsquo;t affect the table, so
												changing just this saves right
												away.
											</p>
										</td>
									</tr>
									<tr>
										<th scope="row">Table</th>
										<td>
											<code>{ model.table }</code>
										</td>
									</tr>
									{ model.migration && (
										<>
											<tr>
												<th scope="row">Migration</th>
												<td>
													<code>
														{ model.migration.class }
													</code>{ ' ' }
													(version{ ' ' }
													{ model.migration.version })
												</td>
											</tr>
											<tr>
												<th scope="row">Status</th>
												<td>
													{ model.migration.has_run
														? '✅ Table created'
														: '⚠️ Migration not yet run' }
												</td>
											</tr>
										</>
									) }
								</tbody>
							</table>

							{ confirming ? (
								<div className="notice notice-warning gateway-inline-confirm">
									<p>
										This creates a new database table under
										the new name and permanently deletes the
										current one, including any data in it.
										This can&rsquo;t be undone.
									</p>
									<p>
										<button
											type="button"
											className="button button-primary"
											onClick={ performSave }
											disabled={ saving }
										>
											{ saving
												? 'Saving…'
												: 'Yes, rename it' }
										</button>{ ' ' }
										<button
											type="button"
											className="button"
											onClick={ () => setConfirming( false ) }
											disabled={ saving }
										>
											Cancel
										</button>
									</p>
								</div>
							) : (
								<p>
									<button
										type="submit"
										className="button button-primary"
										disabled={
											saving || ! title.trim() || unchanged
										}
									>
										{ saving ? 'Saving…' : 'Save' }
									</button>
								</p>
							) }
						</form>

						{ saveResult && ! saveResult.success && (
							<div className="notice notice-error">
								<p>{ saveResult.message }</p>
							</div>
						) }
					</div>

					<div hidden={ 'fields' !== activeTab }>
						<FieldEditor
							key={ model.class }
							modelClass={ model.class }
							initialFields={ model.fields }
							relationships={ relationships }
						/>
					</div>

					<div hidden={ 'relationships' !== activeTab }>
						<RelationshipEditor
							key={ model.class }
							modelClass={ model.class }
							relationships={ relationships }
							onRelationshipsChange={ setRelationships }
						/>
					</div>
				</>
			) }
		</div>
	);
}
