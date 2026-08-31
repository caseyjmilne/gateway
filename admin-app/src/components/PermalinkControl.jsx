/**
 * `RecordForm`'s own control for a Permalink field -- classic WordPress
 * permalink-editing UX (the same "static text + Edit link" pattern a
 * post's own title-adjacent permalink row uses): the slug shows as plain
 * read-only text while in Auto mode (tracking `source_field`, recomputed
 * server-side on save -- see `Records_REST_Controller::
 * resolve_permalink_value()`), with an "Edit" link that switches to
 * Manual mode and reveals a real, freely-editable text input; once in
 * Manual mode, "Revert to automatic" switches back. Both directions are
 * a pure local form-state flip here (`onManualChange`) -- nothing round
 * -trips to the server until the record itself is actually saved, at
 * which point `RecordForm.jsx`'s own `handleSubmit()` sends both this
 * field's value AND its `{name}__manual` companion flag together, and
 * `resolve_permalink_value()` is what actually decides, server-side,
 * whether to take the submitted value literally (Manual) or recompute it
 * fresh from `source_field` (Auto).
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
	onValueChange,
	onManualChange,
} ) {
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
						{ value || '(generated automatically on save)' }
					</code>{ ' ' }
					<button
						type="button"
						className="button-link"
						onClick={ () => onManualChange( true ) }
					>
						Edit
					</button>
				</>
			) }
		</div>
	);
}
