/**
 * A rough, client-side-only mirror of `sanitize_title()` -- the exact
 * transform `Records_REST_Controller::resolve_permalink_value()` runs
 * server-side, just simplified (no accent-folding/entity-decoding, which
 * `sanitize_title()` itself does) since this only ever feeds a LIVE
 * preview here, never the value actually saved. The real, authoritative
 * slug is always computed server-side on save, same "client hint, server
 * enforces" split every other approximate client-side preview in this
 * app already has (e.g. Character Limit's own `maxLength`).
 */
const slugify = ( value ) =>
	String( value ?? '' )
		.toLowerCase()
		.trim()
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );

/**
 * `RecordForm`'s own control for a Permalink field -- classic WordPress
 * permalink-editing UX (the same "static text + Edit link" pattern a
 * post's own title-adjacent permalink row uses): while in Auto mode, this
 * shows a LIVE slug preview -- slugified in real time, client-side, from
 * `sourceValue` (the tracked `source_field`'s own current, still-being
 * -typed form value) -- rather than the last-saved `value`, which would
 * otherwise sit stale (or blank, on Add New) until the record was
 * actually saved and `resolve_permalink_value()` got a chance to compute
 * it for real. Typing "Galaxy" into the tracked field updates this
 * preview to "galaxy" immediately, the same moment-to-moment feedback
 * WordPress's own post-slug row gives when editing a Title.
 *
 * An "Edit" link switches to Manual mode and reveals a real, freely
 * -editable text input -- seeded with whatever the live Auto preview
 * currently reads (not left blank), so switching to Manual is a genuine
 * starting point to tweak from, never a value the site owner has to
 * retype from scratch. Once in Manual mode, "Revert to automatic"
 * switches back (the input's own edits are simply abandoned -- Auto mode
 * always re-derives fresh from `sourceValue` rather than remembering
 * anything the input held). Both directions are a pure local form-state
 * flip here -- nothing round-trips to the server until the record itself
 * is actually saved, at which point `RecordForm.jsx`'s own `handleSubmit()`
 * sends both this field's value AND its `{name}__manual` companion flag
 * together, and `resolve_permalink_value()` is what actually decides,
 * server-side, whether to take the submitted value literally (Manual) or
 * recompute it fresh from `source_field` (Auto) -- exactly mirroring
 * what this control already shows either way.
 *
 * A plain `<div>` wrapper, not `<label>` -- same multi-control reasoning
 * as `FieldEditor.jsx`'s own Type/Embed Size rows (see that component's
 * own docblock): this renders either an `<input>` alongside its own
 * "Revert" button, or a `<code>` alongside its own "Edit" link, always
 * two of its own clickable/focusable things at once, so a real `<label>`
 * around either combination would only ever forward a click on the
 * SECOND one back to the first.
 */
export default function PermalinkControl( {
	id,
	value,
	manual,
	hasSourceField,
	sourceValue,
	onValueChange,
	onManualChange,
} ) {
	const autoSlug = hasSourceField ? slugify( sourceValue ) : '';

	const handleEditClick = () => {
		// Seeds the now-editable input with whatever Auto mode was just
		// showing -- see this component's own docblock for why switching
		// to Manual must never hand back a blank field.
		onValueChange( autoSlug );
		onManualChange( true );
	};

	return (
		<div className="gateway-field-editor-form-field gateway-permalink-control">
			{ manual ? (
				<>
					<input
						id={ id }
						type="text"
						className="regular-text"
						value={ value }
						onChange={ ( event ) =>
							onValueChange( event.target.value )
						}
					/>{ ' ' }
					<button
						type="button"
						className="button-link"
						onClick={ () => onManualChange( false ) }
					>
						Revert to automatic
					</button>
				</>
			) : (
				<>
					<code id={ id }>
						{ ! hasSourceField
							? '(no Source Field configured -- click Edit to set a slug manually)'
							: autoSlug || '--' }
					</code>{ ' ' }
					<button
						type="button"
						className="button-link"
						onClick={ handleEditClick }
					>
						Edit
					</button>
				</>
			) }
		</div>
	);
}
