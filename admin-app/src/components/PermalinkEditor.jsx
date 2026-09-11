import { useEffect, useState } from 'react';
import { apiFetch, WP_ADMIN_URL } from '../api.js';

// Mirrors FieldEditor.jsx's own normalizeSettings() -- same defensive
// reason: a field with no settings configured yet can arrive as `[]`,
// not `{}`. See that function's own docblock for the full story.
const normalizeSettings = ( settings ) =>
	settings && ! Array.isArray( settings ) ? settings : {};

/**
 * Model-level Permalink configuration -- the **Single Record** tab on
 * `ModelDetail`, beside Relationships (named "Permalinks" until a
 * direct request to better describe what it actually configures now --
 * the URL Root plus this model's own Template). Root isn't really a property of
 * one field's own settings panel: it's validated for uniqueness across
 * every OTHER model's own permalink field
 * (`Model_Fields::validate_permalink_settings()`), which belongs with
 * the rest of this model's own configuration, not buried in
 * `FieldEditor`'s per-field panel (which still owns the one thing that
 * IS field-level: Source Field, on its own General tab -- see that
 * component's own docblock).
 *
 * Unlike an earlier version of this tab, "which post renders this
 * model" is no longer something picked HERE at all -- a `gateway_templates`
 * post now declares that itself, via its own "Gateway Template" sidebar
 * setting (`blocks/single-record/src/template-panel.js`), backed by that
 * post's own `_gateway_template_collection` meta
 * (`Template_Post_Type::find_for_class()` is how this looks it back up).
 * This tab only shows that Template's own status -- exists already
 * (link straight to it) or doesn't yet (a direct "Add Template" link,
 * pre-selecting the right post type) -- rather than re-offering a picker
 * that would just be a second, independent way to set the same
 * relationship. That's what the earlier design got wrong: a Page and a
 * Model both had to separately agree on the same pairing, one from each
 * side, with nothing stopping them from disagreeing.
 *
 * There's no new REST route for Root itself -- it still lives in the
 * permalink field's own `gateway_fields.settings` JSON, saved through the
 * exact same `PUT /gateway/v1/models/<class>/fields/<name>` endpoint
 * `FieldEditor` already uses. That endpoint expects a field's *entire*
 * body every time (`Model_Fields::update()`'s own `$settings` parameter
 * replaces the stored settings wholesale, it doesn't merge in only what's
 * given -- see that method's own `sanitize_settings()` call), so
 * `buildBody()` below carries every other already-saved property (name/
 * label/type/required/choices/conditional_logic, and `source_field`
 * within settings) straight through unchanged alongside Root.
 *
 * The Template's own status comes from `GET /gateway/v1/models/<class>/permalink`
 * (`Permalink_REST_Controller`, the same route `gateway/card-link`'s own
 * edit.js already uses) -- its `templateId` field names the Model's own
 * Template post, if one has declared itself for this Collection yet.
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
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ justSaved, setJustSaved ] = useState( false );

	const [ templateId, setTemplateId ] = useState( null );
	const [ templateStatusError, setTemplateStatusError ] = useState( '' );

	// Re-seeds whenever the permalink field itself changes identity (a
	// different model navigated to, or the field just got created/renamed/
	// removed) -- not on every render, so this tab's own in-progress edits
	// aren't stomped by, say, FieldEditor's Source Field autosave landing
	// while this tab happens to also be open.
	useEffect( () => {
		const settings = normalizeSettings( permalinkField?.settings );
		setRoot( settings.root || '' );
		setError( '' );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ permalinkField?.name ] );

	useEffect( () => {
		if ( ! modelClass ) {
			return;
		}

		let cancelled = false;

		apiFetch( `/models/${ encodeURIComponent( modelClass ) }/permalink` )
			.then( ( result ) => {
				if ( ! cancelled ) {
					setTemplateId( result?.templateId ?? null );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setTemplateStatusError( err.message );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ modelClass ] );

	if ( ! permalinkField ) {
		return (
			<div className="gateway-permalink-editor">
				<h3>Single Record</h3>
				<p className="description">
					This model has no Permalink field yet -- add one on the
					Fields tab (type &ldquo;Permalink&rdquo;) to give each
					record its own URL.
				</p>
			</div>
		);
	}

	const savedSettings = normalizeSettings( permalinkField.settings );
	const dirty = root !== ( savedSettings.root || '' );

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
			<h3>Single Record</h3>
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
							<th scope="row">Template</th>
							<td>
								{ templateStatusError ? (
									<p className="description">
										Couldn&rsquo;t check for a
										Template:{ ' ' }
										{ templateStatusError }
									</p>
								) : templateId ? (
									<p>
										<a
											href={ `${ WP_ADMIN_URL }post.php?post=${ templateId }&action=edit` }
										>
											Edit Template
										</a>
									</p>
								) : (
									<p>
										<a
											href={ `${ WP_ADMIN_URL }post-new.php?post_type=gateway_templates&model=${ encodeURIComponent( modelClass ) }` }
											className="button"
										>
											Add Template
										</a>
									</p>
								) }
								<p className="description">
									A real block-editor page rendering one
									record -- design it with Gateway blocks
									(e.g. Card Field Text, Related Items),
									then pick this Model in its own
									&ldquo;Gateway Template&rdquo; sidebar
									panel.
								</p>
							</td>
						</tr>
					</tbody>
				</table>

				{ root && templateId && (
					<p className="description">
						Preview: <code>/{ root }/example-slug</code>
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
