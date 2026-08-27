import { useState } from 'react';

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
	const [ values, setValues ] = useState( () => {
		const initial = {};
		fields.forEach( ( field ) => {
			const existing =
				initialValues && initialValues[ field.name ] !== undefined
					? initialValues[ field.name ]
					: '';
			initial[ field.name ] = null === existing ? '' : String( existing );
		} );
		return initial;
	} );

	const handleChange = ( name ) => ( event ) => {
		setValues( ( current ) => ( { ...current, [ name ]: event.target.value } ) );
	};

	const handleSubmit = ( event ) => {
		event.preventDefault();
		onSubmit( values );
	};

	const inputTypeFor = ( type ) => {
		const found = fieldTypes.find( ( fieldType ) => fieldType.key === type );
		return found ? found.input_type : 'text';
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
						</label>
						<br />
						{ 'textarea' === inputType && (
							<textarea
								id={ inputId }
								className="regular-text"
								rows={ 4 }
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
						{ 'textarea' !== inputType && 'range' !== inputType && (
							<input
								id={ inputId }
								type={ inputType }
								className="regular-text"
								value={ values[ field.name ] }
								onChange={ handleChange( field.name ) }
							/>
						) }
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
