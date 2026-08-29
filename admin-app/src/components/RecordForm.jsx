import { useState } from 'react';
import RelateAutocomplete from './RelateAutocomplete.jsx';

/**
 * A form with one input per model field, used both for "Add New" and for
 * editing an existing record in place -- which `<input type="...">` each
 * field renders as comes from `fieldTypes` (Gateway\Field_Type_Registry,
 * via useFieldTypes()), not a hardcoded guess here: a field's own `type`
 * (e.g. "number") is looked up against the registry's `input_type` for
 * that type, defaulting to a plain text input if a type somehow isn't
 * found (a field referencing a type that's since been unregistered,
 * rather than the form breaking outright).
 *
 * One `input_type` value, "textarea", isn't a real HTML `<input>` type
 * at all (there's no `<input type="textarea">`) -- it's Text_Area_Field_Type's
 * own signal to render a `<textarea>` element instead, handled as a
 * special case below. "range" is a real `<input>` type, but a bare
 * slider with no visible number is barely usable, so it gets its own
 * small live readout alongside it.
 *
 * "relate_one"/"relate_many" (Relate_To_One_Field_Type/Relate_To_Many_Field_Type)
 * are two more special cases: Records_REST_Controller enriches a relate
 * field's value into `{id, label}` (relate_one) or `[{id, label}, ...]`
 * (relate_many) rather than a plain scalar, so unlike every other field
 * here its form state holds that same shape (not a stringified value)
 * and renders as a RelateAutocomplete instead of a plain `<input>`.
 * Submitting converts it back to what the server actually expects --
 * just the id(s), not the enriched `{id, label}` shape it was displayed
 * with.
 *
 * "select"/"radio"/"buttons" (Select_Field_Type/Radio_Field_Type/
 * Buttons_Field_Type -- Choice_Field_Type, `is_multiple: false`) each
 * render their own kind of single-selection control, built from the
 * field's own `choices` (Gateway\\Model_Field_Choices, threaded straight
 * through by Model_Fields::all()/the fields REST route -- the same
 * per-field array every one of these three reads, just with a different
 * widget on top); their form state and submitted value are both a plain
 * string, same as a Text field's. "checkboxes" (Checkbox_Field_Type,
 * `is_multiple: true`) is the one multi-selection case: form state and
 * submitted value are both a plain string array (`[]` if none checked),
 * matching Checkbox_Field_Type::cast()'s own shape -- unrelated to
 * relate_many's `[{id,label}, ...]` above despite the shared "array"
 * shape; nothing here is an id. "boolean" (True_False_Field_Type) is a
 * single native checkbox; its form state and submitted value are both a
 * real JS boolean, not a string -- initialValues coming back as `0`/`1`/
 * `"0"`/`"1"` (a driver that doesn't apply Eloquent's own boolean cast
 * strictly) is coerced with `Boolean()` either way.
 *
 * `field.settings` (Gateway\\Field_Type::presentation_fields(), threaded
 * straight through by Model_Fields::all()/the fields REST route, same as
 * `field.choices`) is read generically here, not gated on `field.type
 * === 'text'` specifically: `[]`/`{}` for every field whose type doesn't
 * recognize any of the fixed catalog (`Model_Fields::sanitize_settings()`
 * already guarantees that server-side), so this component never needs
 * its own per-type list to know when there's nothing to show.
 * `settings.instructions` renders as a small note between the label and
 * the actual control, for any field type; `settings.placeholder`/`step`/
 * `prepend`/`append` only ever have anything to show for the one plain
 * `<input>` fallback branch at the bottom (nothing else -- textarea,
 * select, a relate autocomplete, ...) -- currently recognizes them at
 * all. `step` only ever comes back non-empty for a Number field (the
 * only type `Field_Type::presentation_fields()` recognizes it for), and
 * passes straight through to the `<input>`'s own `step` attribute
 * unconditionally -- setting `step` on a non-numeric `<input type>` is a
 * silent no-op in every browser, so there's no need to gate it on
 * `inputType === 'number'` here as well.
 *
 * `settings.default` (`Field_Type::supports_default_value()`, currently
 * Text/Number only -- FieldEditor's own General tab, not Presentation)
 * is different from the rest of `settings` in one way: it only ever
 * applies to a brand new record, never an existing one being edited, so
 * `initialValues` state's own initializer above checks `!initialValues`
 * (true only for "Add New" -- editing always passes a real, even if
 * blank, `initialValues`) before falling back to it, rather than reading
 * it unconditionally the way `instructions`/`placeholder`/etc. do.
 *
 * `settings.character_limit` (`Field_Type::supports_character_limit()`,
 * Text/Text Area only -- FieldEditor's own Validation tab) passes
 * straight through to the plain `<input>` fallback branch's/`<textarea>`'s
 * own `maxLength` -- a client-side convenience only, stopping a visitor
 * from typing past the limit rather than letting them submit and then
 * rejecting it; the actual enforcement, which this convenience can never
 * substitute for (a request built by hand, bypassing this form entirely,
 * skips it too), is `Model_Fields::validate_character_limits()` on the
 * server, the same "client hint, server enforces" split `required`'s own
 * red `*` above already has.
 */
export default function RecordForm( {
	fields,
	fieldTypes,
	initialValues,
	onSubmit,
	onCancel,
	submitLabel,
	submitting,
} ) {
	const inputTypeFor = ( type ) => {
		const found = fieldTypes.find( ( fieldType ) => fieldType.key === type );
		return found ? found.input_type : 'text';
	};

	const [ values, setValues ] = useState( () => {
		const initial = {};
		fields.forEach( ( field ) => {
			const inputType = inputTypeFor( field.type );
			const existing =
				initialValues && initialValues[ field.name ] !== undefined
					? initialValues[ field.name ]
					: null;

			if ( 'relate_one' === inputType ) {
				initial[ field.name ] = existing || null;
			} else if ( 'relate_many' === inputType ) {
				initial[ field.name ] = existing || [];
			} else if ( 'checkboxes' === inputType ) {
				initial[ field.name ] = Array.isArray( existing )
					? existing
					: [];
			} else if ( 'boolean' === inputType ) {
				initial[ field.name ] = Boolean( existing );
			} else if (
				null === existing &&
				! initialValues &&
				field.settings?.default
			) {
				// `!initialValues` -- not just `null === existing` -- is
				// what actually confines this to "Add New": editing an
				// existing record always passes a real (even if blank)
				// `initialValues`, so a field that's genuinely empty on
				// that record still ends up '' below, never silently
				// replaced by its own type's configured default.
				initial[ field.name ] = field.settings.default;
			} else {
				initial[ field.name ] =
					null === existing ? '' : String( existing );
			}
		} );
		return initial;
	} );

	const handleChange = ( name ) => ( event ) => {
		setValues( ( current ) => ( { ...current, [ name ]: event.target.value } ) );
	};

	const handleRelateChange = ( name ) => ( newValue ) => {
		setValues( ( current ) => ( { ...current, [ name ]: newValue } ) );
	};

	// "buttons" has no native form element of its own to read a value
	// off of (unlike <select>/<input type="radio">, both handled by the
	// plain handleChange() above) -- a click just sets the field straight
	// to the clicked choice.
	const handleButtonSelect = ( name ) => ( choice ) => {
		setValues( ( current ) => ( { ...current, [ name ]: choice } ) );
	};

	const handleCheckboxToggle = ( name, choice ) => ( event ) => {
		setValues( ( current ) => {
			const selected = current[ name ] || [];
			const next = event.target.checked
				? [ ...selected, choice ]
				: selected.filter( ( value ) => value !== choice );
			return { ...current, [ name ]: next };
		} );
	};

	const handleBooleanChange = ( name ) => ( event ) => {
		setValues( ( current ) => ( {
			...current,
			[ name ]: event.target.checked,
		} ) );
	};

	const handleSubmit = ( event ) => {
		event.preventDefault();

		const payload = {};
		fields.forEach( ( field ) => {
			const inputType = inputTypeFor( field.type );

			if ( 'relate_one' === inputType ) {
				const selected = values[ field.name ];
				payload[ field.name ] = selected ? selected.id : null;
			} else if ( 'relate_many' === inputType ) {
				payload[ field.name ] = ( values[ field.name ] || [] ).map(
					( item ) => item.id
				);
			} else {
				// Covers "checkboxes" (already a string array) and
				// "boolean" (already a real bool) as-is, alongside every
				// plain-string field type (text/number/select/radio/
				// buttons/...) -- none of those need converting either.
				payload[ field.name ] = values[ field.name ];
			}
		} );

		onSubmit( payload );
	};

	return (
		<form onSubmit={ handleSubmit } className="gateway-record-form">
			{ fields.map( ( field ) => {
				const inputType = inputTypeFor( field.type );
				const inputId = `gateway-record-field-${ field.name }`;

				return (
					<p key={ field.name }>
						<label htmlFor={ inputId }>
							{ field.label || field.name }
							{ field.required && (
								<span
									className="gateway-record-form-required"
									title="Required"
									aria-label="Required"
								>
									{ ' ' }*
								</span>
							) }
						</label>
						{ field.settings?.instructions && (
							<span className="description gateway-record-form-instructions">
								{ field.settings.instructions }
							</span>
						) }
						<br />
						{ 'textarea' === inputType && (
							<textarea
								id={ inputId }
								className="regular-text"
								rows={ 4 }
								maxLength={ field.settings?.character_limit || undefined }
								value={ values[ field.name ] }
								onChange={ handleChange( field.name ) }
							/>
						) }
						{ 'range' === inputType && (
							<>
								<input
									id={ inputId }
									type="range"
									value={ values[ field.name ] || 0 }
									onChange={ handleChange( field.name ) }
								/>{ ' ' }
								<output>{ values[ field.name ] || 0 }</output>
							</>
						) }
						{ ( 'relate_one' === inputType ||
							'relate_many' === inputType ) && (
							<RelateAutocomplete
								relatedModel={ field.related_model }
								multiple={ 'relate_many' === inputType }
								value={ values[ field.name ] }
								onChange={ handleRelateChange( field.name ) }
							/>
						) }
						{ 'select' === inputType && (
							<select
								id={ inputId }
								value={ values[ field.name ] }
								onChange={ handleChange( field.name ) }
							>
								<option value="">— Select —</option>
								{ ( field.choices || [] ).map( ( choice ) => (
									<option key={ choice } value={ choice }>
										{ choice }
									</option>
								) ) }
							</select>
						) }
						{ 'radio' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<label
									key={ choice }
									className="gateway-record-form-choice"
								>
									<input
										type="radio"
										name={ inputId }
										value={ choice }
										checked={ values[ field.name ] === choice }
										onChange={ handleChange( field.name ) }
									/>{ ' ' }
									{ choice }
								</label>
							) ) }
						{ 'buttons' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<button
									key={ choice }
									type="button"
									className={
										'button' +
										( values[ field.name ] === choice
											? ' button-primary'
											: '' )
									}
									onClick={ () =>
										handleButtonSelect( field.name )(
											choice
										)
									}
								>
									{ choice }
								</button>
							) ) }
						{ 'checkboxes' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<label
									key={ choice }
									className="gateway-record-form-choice"
								>
									<input
										type="checkbox"
										checked={ (
											values[ field.name ] || []
										).includes( choice ) }
										onChange={ handleCheckboxToggle(
											field.name,
											choice
										) }
									/>{ ' ' }
									{ choice }
								</label>
							) ) }
						{ 'boolean' === inputType && (
							<input
								id={ inputId }
								type="checkbox"
								checked={ Boolean( values[ field.name ] ) }
								onChange={ handleBooleanChange( field.name ) }
							/>
						) }
						{ 'textarea' !== inputType &&
							'range' !== inputType &&
							'relate_one' !== inputType &&
							'relate_many' !== inputType &&
							'select' !== inputType &&
							'radio' !== inputType &&
							'buttons' !== inputType &&
							'checkboxes' !== inputType &&
							'boolean' !== inputType &&
							( field.settings?.prepend || field.settings?.append ? (
								<span className="gateway-record-form-input-group">
									{ field.settings.prepend && (
										<span className="gateway-record-form-input-addon">
											{ field.settings.prepend }
										</span>
									) }
									<input
										id={ inputId }
										type={ inputType }
										className="regular-text"
										placeholder={ field.settings?.placeholder }
										step={ field.settings?.step || undefined }
										maxLength={ field.settings?.character_limit || undefined }
										value={ values[ field.name ] }
										onChange={ handleChange( field.name ) }
									/>
									{ field.settings.append && (
										<span className="gateway-record-form-input-addon">
											{ field.settings.append }
										</span>
									) }
								</span>
							) : (
								<input
									id={ inputId }
									type={ inputType }
									className="regular-text"
									placeholder={ field.settings?.placeholder }
									step={ field.settings?.step || undefined }
									maxLength={ field.settings?.character_limit || undefined }
									value={ values[ field.name ] }
									onChange={ handleChange( field.name ) }
								/>
							) ) }
					</p>
				);
			} ) }
			<p>
				<button
					type="submit"
					className="button button-primary"
					disabled={ submitting }
				>
					{ submitting ? 'Saving…' : submitLabel }
				</button>{ ' ' }
				{ onCancel && (
					<button
						type="button"
						className="button"
						onClick={ onCancel }
						disabled={ submitting }
					>
						Cancel
					</button>
				) }
			</p>
		</form>
	);
}
