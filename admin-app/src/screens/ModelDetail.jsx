import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import useResolvedModelClass from '../hooks/useResolvedModelClass.js';
import FieldEditor from '../components/FieldEditor.jsx';
import RelationshipEditor from '../components/RelationshipEditor.jsx';
import PermalinkEditor from '../components/PermalinkEditor.jsx';
import ColumnsEditor from '../components/ColumnsEditor.jsx';
import Modal from '../components/Modal.jsx';
import { SkeletonBar } from '../components/Skeleton.jsx';

// Gateway\Model_Builder::TYPE_CONTENT_TYPE/TYPE_DATA_MODEL's own values --
// same fixed, hardcoded vocabulary ModelsList.jsx's own create-form
// dropdown (MODEL_TYPES there) is built from, just the label half of it:
// there's no `<select>` here to build, only a fixed value to show back as
// text (see this screen's own docblock on why Type is never editable
// once a model exists).
const MODEL_TYPE_LABELS = {
	content_type: 'Content Type',
	data_model: 'Data Model',
};

// Every tab this screen has, 'general' included -- App.jsx's own
// `/models/:modelSlug/:tab` route accepts any of these five as `:tab`
// (`/models/doc/general` works too, even though the General tab's own
// Link below points at the shorter bare `/models/doc` instead -- no
// reason to treat an explicit "general" in the URL as invalid when it's
// unambiguous). Anything else lands here as an unrecognized `:tab` --
// see the redirect effect below.
const TABS = [ 'general', 'fields', 'relationships', 'permalinks', 'columns' ];

/**
 * Single-model detail view -- shows what's known about one registered
 * model (its table, and its migration's version + whether it has actually
 * run), lets its Title and Plural Title be changed, and hosts its own
 * Fields/Relationships/Permalinks/Columns editors, all five behind one
 * text-based tab strip: **General** (Title/Plural Title/Table/Migration/
 * Status), **Fields** (`FieldEditor`), **Relationships**
 * (`RelationshipEditor`), **Permalinks** (`PermalinkEditor`), **Columns**
 * (`ColumnsEditor` -- which of this model's own fields show as columns
 * on its Records table, their order, and which are sortable).
 *
 * Each tab is its own real route (`/models/:modelSlug` for General,
 * `/models/:modelSlug/fields` for Fields, etc. -- see App.jsx's own
 * `/models/:modelSlug/:tab` route and the `TABS` const above), not local
 * component state, per a direct request: these needed to be linkable from
 * documentation and shareable between users, not just reachable by
 * clicking through from the model's own General tab. `activeTab` is
 * derived from the URL's own `:tab` param (falling back to 'general' for
 * both the no-tab route and an unrecognized `:tab` -- see the redirect
 * effect below) rather than a `useState`, and the tab strip below is
 * `Link`s, not `button onClick` handlers, so each tab genuinely
 * navigates (bookmarkable, back-button-friendly, middle-click-to-open-in
 * -a-new-tab) instead of just toggling a hidden `<div>` in place. The
 * five sections themselves are still ALWAYS mounted (`hidden`, not
 * conditional rendering) so switching tabs never loses an in-progress
 * edit or re-fetches -- only what decides which one is currently visible
 * changed. The same `.gateway-subtab`/
 * `.gateway-subtab-active` classes `FieldEditor`'s own inner General/
 * Validation/Presentation/Conditional Logic tabs already use, not a
 * second, visually-different tab style of this page's own -- before this,
 * General's own content (Title/Plural Title/Table/Migration/Status) sat
 * permanently visible above a SEPARATE, differently-styled `nav-tab`/
 * `nav-tab-active` (WordPress core's own boxed look) strip for just
 * Fields/Relationships; now every section is a tab, all four sharing one
 * consistent look.
 *
 * The model class heading (`.gateway-model-detail-heading`/`-badge`) is
 * deliberately sized and spaced to match `RecordsCrud.jsx`'s own
 * `gateway-records-crud-heading`/`-model-badge` -- per a direct report
 * that this screen's own title read visually smaller than that one's
 * "Records" heading (both plain, unstyled `<h2><code>` before this) and
 * sat with roughly the same gap above it (this page's OWN General/Fields/
 * Relationships/Permalinks/Columns tab strip) as below it (WordPress's
 * own primary Models/Records/Database tabs) -- ambiguous about which it
 * actually belongs to. The explicit `margin-bottom` here (matching
 * `gateway-records-crud-heading`'s own exact value) tightens that gap so
 * the heading reads as belonging with the tab strip and content
 * beneath it, not stuck equidistant between two unrelated tab rows.
 *
 * While `model` itself is still loading, a shimmering skeleton
 * (`.gateway-model-detail-skeleton`, built from `Skeleton.jsx`'s own
 * shared `SkeletonBar` -- see that module's own docblock for why this
 * app has one canonical shimmer definition rather than a redundant copy
 * per screen) stands in for this same heading/tab-strip shape instead of
 * a bare "Loading…" line -- the same "never a full-page text swap,
 * always a shaped placeholder" treatment RecordsCrud.jsx's own row
 * skeleton already established for a background records reload, applied
 * here to this screen's own FIRST load instead. Purely visual
 * (`aria-hidden`); a `screen-reader-text`/`role="status"` line right
 * after it is what actually announces "loading" to assistive tech, the
 * same split that component uses.
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
 *
 * **Type** (Content Type/Data Model -- Model_Builder::get_model_type())
 * sits right underneath Title as a plain, static label, never a control
 * of its own -- unlike everything else on this tab, it was only ever a
 * choice on the Create Model form (`ModelsList.jsx`'s own `MODEL_TYPES`),
 * fixed forever the moment the model was actually created. There's no
 * migration path this screen could sensibly offer either direction:
 * Content Type -> Data Model would leave its seeded `title`/`permalink`
 * fields orphaned rather than remove them out from under any real data
 * they might already hold, and Data Model -> Content Type has no way to
 * infer which (if any) of a model's existing fields should suddenly
 * become "the" title.
 */
export default function ModelDetail() {
	const { modelSlug, tab } = useParams();
	// The slug is what the URL actually carries -- everything below still
	// works in terms of the real class name, resolved once here (see
	// that hook's own docblock for why this fetches the models list
	// rather than adding a dedicated REST route just for this lookup).
	const { className, error: slugError } = useResolvedModelClass( modelSlug );
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

	// The Danger Zone's own delete-confirm flow -- a single model in
	// view here, not a list of many deletable items, so this is plain
	// local state rather than the `deleteConfirm<Thing>`-keyed-by-id
	// pattern FieldEditor/RelationshipEditor use for their own rows.
	// `deleteError` is deliberately its own state, not `saveResult`
	// above (shared today only by the rename/plural-title Save flow) --
	// a failed delete needs to render INSIDE the still-open confirm
	// modal, not in the General tab's own save-error banner, the same
	// "each action's own error stays separate" convention every other
	// delete-confirm flow in this app already follows.
	const [ showDeleteConfirm, setShowDeleteConfirm ] = useState( false );
	const [ deleteConfirmText, setDeleteConfirmText ] = useState( '' );
	const [ deletingModel, setDeletingModel ] = useState( false );
	const [ deleteError, setDeleteError ] = useState( '' );

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

	// Same reasoning, same shape, for `fields` -- PermalinkEditor's own
	// Source Field eligibility list (which of this model's OTHER fields are
	// is_text_renderable()) needs FieldEditor's live, up-to-the-moment
	// fields, not a copy fetched once on this page's own initial load. This
	// used to be FieldEditor's own local state, seeded once from an
	// `initialFields` prop and never shared -- lifted here the moment
	// PermalinkEditor needed the same live view RelationshipEditor already
	// had.
	const [ fields, setFields ] = useState( [] );

	// Which of General/Fields/Relationships/Permalinks/Columns is showing --
	// driven by the URL's own `:tab` param now (see this component's own
	// docblock), not local state. `undefined` (the bare `/models/:modelSlug`
	// route, no `:tab` segment matched at all) and an unrecognized `:tab`
	// both fall back to 'general' here; the latter also gets redirected to
	// the canonical bare URL by the effect below, so an old/mistyped link
	// doesn't just silently show General forever at a URL that looks like
	// it should be something else.
	const activeTab = TABS.includes( tab ) ? tab : 'general';

	useEffect( () => {
		if ( tab && ! TABS.includes( tab ) ) {
			navigate( `/models/${ modelSlug }`, { replace: true } );
		}
	}, [ tab, modelSlug, navigate ] );

	useEffect( () => {
		// Waits for the slug to resolve to a real class name first (see
		// useResolvedModelClass()'s own docblock) -- `loading` simply
		// stays true the whole time either way, so "Loading…" already
		// covers both phases without a separate state of its own; a slug
		// that never resolves (slugError set instead) is handled by the
		// JSX below rendering that error and no longer showing "Loading…"
		// once it's set, since this effect body never runs at all in
		// that case.
		if ( ! className ) {
			return;
		}

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
				setFields( data.fields || [] );
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
			// The class name (and therefore this page's own URL, which is
			// keyed by its SLUG -- see App.jsx's own docblock) may have
			// changed -- navigate to wherever the model actually lives now
			// rather than staying on a route that no longer resolves. A
			// Plural-Title-only save lands back on this same route (`rename()`
			// still returns a real `slug` even when the class itself is
			// unchanged -- see Model_Builder::rename()'s own docblock).
			navigate( `/models/${ data.slug }`, {
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

	const handleDeleteModel = async () => {
		setDeleteError( '' );
		setDeletingModel( true );

		try {
			const data = await apiFetch(
				`/models/${ encodeURIComponent( className ) }`,
				{ method: 'DELETE' }
			);
			setShowDeleteConfirm( false );
			navigate( '/', {
				replace: true,
				state:
					data.warnings && data.warnings.length
						? { notice: data.warnings.join( ' ' ) }
						: undefined,
			} );
		} catch ( error ) {
			setDeleteError( error.message );
		} finally {
			setDeletingModel( false );
		}
	};

	return (
		<div className="gateway-model-detail">
			{ loading && ! slugError && (
				<>
					{ /* Purely visual -- a screen reader has no reason to read a
					   * row of placeholder bars one at a time; the real
					   * "loading" announcement is the screen-reader-only
					   * status text right after it, the same split
					   * RecordsCrud.jsx's own SkeletonRows/status-text pair
					   * already uses. */ }
					<div className="gateway-model-detail-skeleton" aria-hidden="true">
						<SkeletonBar className="gateway-model-detail-skeleton-title" />
						<div className="gateway-model-detail-skeleton-tabs">
							<SkeletonBar />
							<SkeletonBar />
							<SkeletonBar />
							<SkeletonBar />
						</div>
						<SkeletonBar className="gateway-model-detail-skeleton-line" />
						<SkeletonBar className="gateway-model-detail-skeleton-line" />
					</div>
					<span className="screen-reader-text" role="status">
						Loading…
					</span>
				</>
			) }

			{ slugError && (
				<div className="notice notice-error">
					<p>{ slugError }</p>
				</div>
			) }

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
					<h2 className="gateway-model-detail-heading">
						<code className="gateway-model-detail-badge">
							{ model.class }
						</code>
					</h2>

					<div className="gateway-subtabs">
						<Link
							to={ `/models/${ modelSlug }` }
							className={ subtabClass( 'general' === activeTab ) }
						>
							General
						</Link>
						<Link
							to={ `/models/${ modelSlug }/fields` }
							className={ subtabClass( 'fields' === activeTab ) }
						>
							Fields
						</Link>
						<Link
							to={ `/models/${ modelSlug }/relationships` }
							className={ subtabClass( 'relationships' === activeTab ) }
						>
							Relationships
						</Link>
						<Link
							to={ `/models/${ modelSlug }/permalinks` }
							className={ subtabClass( 'permalinks' === activeTab ) }
						>
							Permalinks
						</Link>
						<Link
							to={ `/models/${ modelSlug }/columns` }
							className={ subtabClass( 'columns' === activeTab ) }
						>
							Columns
						</Link>
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
										<th scope="row">Type</th>
										<td>
											{ MODEL_TYPE_LABELS[ model.type ] || model.type }
											<p className="description">
												Fixed when the model was created --
												can&rsquo;t be changed afterward.
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

						<div className="gateway-danger-zone">
							<h3 className="gateway-danger-zone-title">
								Danger Zone
							</h3>
							<p className="description">
								Deleting this model permanently drops its
								real database table --{ ' ' }
								<code>{ model.table }</code> -- destroying
								every record it currently holds. This
								cannot be undone.
							</p>
							<p>
								<button
									type="button"
									className="button button-danger"
									onClick={ () => {
										setDeleteError( '' );
										setDeleteConfirmText( '' );
										setShowDeleteConfirm( true );
									} }
								>
									Delete Model
								</button>
							</p>
						</div>
					</div>

					<div hidden={ 'fields' !== activeTab }>
						<FieldEditor
							key={ model.class }
							modelClass={ model.class }
							fields={ fields }
							onFieldsChange={ setFields }
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

					<div hidden={ 'permalinks' !== activeTab }>
						<PermalinkEditor
							key={ model.class }
							modelClass={ model.class }
							fields={ fields }
							onFieldsChange={ setFields }
						/>
					</div>

					<div hidden={ 'columns' !== activeTab }>
						<ColumnsEditor
							key={ model.class }
							modelClass={ model.class }
							fields={ fields }
							initialColumns={ model.columns }
						/>
					</div>

					{ showDeleteConfirm && (
						<Modal
							title="Delete Model"
							onClose={ () => setShowDeleteConfirm( false ) }
						>
							<p>
								Are you sure you want to delete{ ' ' }
								<code>{ model.plural_title || model.class }</code>?
								This permanently drops its real database
								table -- <code>{ model.table }</code> --
								destroying every record currently in it.{ ' ' }
								<strong>This cannot be undone.</strong>
							</p>
							<p>
								Type <code>{ model.class }</code> to
								confirm:
							</p>
							<p>
								<input
									type="text"
									className="regular-text"
									value={ deleteConfirmText }
									onChange={ ( event ) =>
										setDeleteConfirmText(
											event.target.value
										)
									}
									disabled={ deletingModel }
									autoFocus
								/>
							</p>
							{ deleteError && (
								<div className="notice notice-error">
									<p>{ deleteError }</p>
								</div>
							) }
							<p>
								<button
									type="button"
									className="button button-danger"
									onClick={ handleDeleteModel }
									disabled={
										deletingModel ||
										deleteConfirmText !== model.class
									}
								>
									{ deletingModel
										? 'Deleting…'
										: 'Delete Model' }
								</button>{ ' ' }
								<button
									type="button"
									className="button"
									onClick={ () =>
										setShowDeleteConfirm( false )
									}
									disabled={ deletingModel }
								>
									Cancel
								</button>
							</p>
						</Modal>
					) }
				</>
			) }
		</div>
	);
}

// Mirrors App.jsx's own navTabClass() -- same "one shared helper for the
// active/inactive class string" reasoning, just for this page's own
// `.gateway-subtab`/`.gateway-subtab-active` pair instead of core's
// `nav-tab`/`nav-tab-active`.
function subtabClass( isActive ) {
	return 'gateway-subtab' + ( isActive ? ' gateway-subtab-active' : '' );
}
