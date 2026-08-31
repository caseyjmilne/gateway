import { useEffect, useState } from 'react';
import { apiFetch, fetchWpPages } from '../api.js';

// Mirrors FieldEditor.jsx's own normalizeSettings() -- same defensive
// reason: a field with no settings configured yet can arrive as `[]`,
// not `{}`. See that function's own docblock for the full story.
const normalizeSettings = ( settings ) =>
	settings && ! Array.isArray( settings ) ? settings : {};

/**
 * Model-level Permalink configuration -- the **Permalinks** tab on
 * `ModelDetail`, beside Relationships. Unlike everything on the Fields
 * tab, Root and Template Page aren't really properties of one field's own
 * settings panel: Root is validated for uniqueness across every OTHER
 * model's own permalink field (`Model_Fields::validate_permalink_settings()`),
 * and Template Page picks a real WordPress Page that has nothing to do
 * with this model's schema at all -- both belong with the rest of this
 * model's own configuration, not buried in `FieldEditor`'s per-field
 * panel (which still owns the one thing that IS field-level: Source
 * Field, on its own General tab -- see that component's own docblock).
 *
 * There's no new REST route here -- Root/Template Page still live in the
 * permalink field's own `gateway_fields.settings` JSON, saved through the
 * exact same `PUT /gateway/v1/models/<class>/fields/<name>` endpoint
 * `FieldEditor` already uses. That endpoint expects a field's *entire*
 * body every time (`Model_Fields::update()`'s own `$settings` parameter
 * replaces the stored settings wholesale, it doesn't merge in only what's
 * given -- see that method's own `sanitize_settings()` call), so
 * `buildBody()` below carries every other already-saved property (name/
 * label/type/required/choices/conditional_logic, and `source_field`
 * within settings) straight through unchanged alongside whichever of
 * Root/Template Page this tab is actually editing.
 *
 * Finds the model's (at most one) permalink field client-side --
 * `fields.find(f => f.type === 'permalink')` -- from the same lifted
 * `fields` state `FieldEditor` now shares with this component via
 * `ModelDetail` (see that screen's own docblock for why `fields` was
 * lifted the same way `relationships` already was). No field yet -> a
 * plain nudge pointing at the Fields tab; this tab never offers to
 * create one itself.
 *
 * A plain Save button, not autosave -- unlike FieldEditor's own
 * per-keystroke debounce (appropriate there because every field's own
 * row is a small, independent unit), Root's own cross-model uniqueness
 * check means a rejected save here is a real, expected possibility (two
 * site owners picking "tickets" independently) that deserves a deliberate
 * "try again" moment rather than silently retrying every 800ms while
 * someone is still typing out a longer root.
 */
export default function PermalinkEditor( { modelClass, fields, onFieldsChange } ) {
	const permalinkField = fields.find( ( field ) => 'permalink' === field.type );

	const [ root, setRoot ] = useState( '' );
	const [ templatePageId, setTemplatePageId ] = useState( '' );
	const [ pages, setPages ] = useState( [] );
	const [ pagesError, setPagesError ] = useState( '' );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ justSaved, setJustSaved ] = useState( false );

	// Re-seeds whenever the permalink field itself changes identity (a
	// different model navigated to, or the field just got created/renamed/
	// removed) -- not on every render, so this tab's own in-progress edits
	// aren't stomped by, say, FieldEditor's Source Field autosave landing
	// while this tab happens to also be open.
	useEffect( () => {
		const settings = normalizeSettings( permalinkField?.settings );
		setRoot( settings.root || '' );
		setTemplatePageId( settings.template_page_id || '' );
		setError( '' );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ permalinkField?.name ] );

	useEffect( () => {
		let cancelled = false;

		fetchWpPages()
			.then( ( result ) => {
				if ( ! cancelled ) {
					setPages( result );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setPagesError( err.message );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [] );

	if ( ! permalinkField ) {
		return (
			<div className="gateway-permalink-editor">
				<h3>Permalinks</h3>
				<p className="description">
					This model has no Permalink field yet -- add one on the
					Fields tab (type &ldquo;Permalink&rdquo;) to give each
					record its own URL.
				</p>
			</div>
		);
	}

	const savedSettings = normalizeSettings( permalinkField.settings );
	const dirty =
		root !== ( savedSettings.root || '' ) ||
		String( templatePageId || '' ) !== String( savedSettings.template_page_id || '' );

	const handleSave = async ( event ) => {
		event.preventDefault();
		setSaving( true );
		setError( '' );

		try {
			const body = {
				name: permalinkField.name,
				label: permalinkField.label,
				type: permalinkField.type,
				required: Boolean( permalinkField.required ),
				choices: permalinkField.choices || [],
				settings: {
					...savedSettings,
					root,
					template_page_id: templatePageId,
				},
				conditional_logic: permalinkField.conditional_logic || {
					enabled: false,
					groups: [],
				},
			};

			const saved = await apiFetch(
				`/models/${ encodeURIComponent( modelClass ) }/fields/${ encodeURIComponent(
					permalinkField.name
				) }`,
				{ method: 'PUT', body: JSON.stringify( body ) }
			);

			onFieldsChange( ( current ) =>
				current.map( ( field ) =>
					field.name === permalinkField.name ? saved : field
				)
			);
			setJustSaved( true );
			setTimeout( () => setJustSaved( false ), 1500 );
		} catch ( err ) {
			setError( err.message );
		} finally {
			setSaving( false );
		}
	};

	return (
		<div className="gateway-permalink-editor">
			<h3>Permalinks</h3>
			<p className="description">
				Configures where{ ' ' }
				<code>{ permalinkField.label || permalinkField.name }</code>
				&rsquo;s records live -- e.g. a Root of &ldquo;tickets&rdquo;
				makes a record&rsquo;s URL{ ' ' }
				<code>/tickets/{ '{slug}' }</code>.
			</p>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			<form onSubmit={ handleSave }>
				<table className="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-permalink-root">
									Root
								</label>
							</th>
							<td>
								<input
									id="gateway-permalink-root"
									type="text"
									className="regular-text"
									placeholder="e.g. tickets"
									value={ root }
									onChange={ ( event ) =>
										setRoot( event.target.value )
									}
								/>
								<p className="description">
									Must be unique across every model on
									this site. Leave blank to leave this
									model unrouted for now.
								</p>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-permalink-template-page">
									Template Page
								</label>
							</th>
							<td>
								{ pagesError ? (
									<p className="description">
										Couldn&rsquo;t load pages:{ ' ' }
										{ pagesError }
									</p>
								) : (
									<select
										id="gateway-permalink-template-page"
										className="regular-text"
										value={ templatePageId }
										onChange={ ( event ) =>
											setTemplatePageId(
												event.target.value
											)
										}
									>
										<option value="">
											None selected yet
										</option>
										{ pages.map( ( page ) => (
											<option
												key={ page.id }
												value={ page.id }
											>
												{ page.title }
											</option>
										) ) }
									</select>
								) }
								<p className="description">
									The WordPress Page whose template
									renders one record -- add a{ ' ' }
									<code>gateway/single-record</code> block
									to it.
								</p>
							</td>
						</tr>
					</tbody>
				</table>

				{ root && templatePageId ? (
					<p className="description">
						Preview: <code>/{ root }/example-slug</code>
					</p>
				) : (
					<p className="description">
						Both Root and Template Page are required before
						this model&rsquo;s records are reachable at their
						own URL.
					</p>
				) }

				<p>
					<button
						type="submit"
						className="button button-primary"
						disabled={ saving || ! dirty }
					>
						{ saving ? 'Saving…' : 'Save' }
					</button>
					{ justSaved && ! dirty && (
						<span className="gateway-field-editor-save-status">
							{ ' ' }
							Saved
						</span>
					) }
				</p>
			</form>
		</div>
	);
}
