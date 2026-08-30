import { useState } from 'react';
import RelateAutocomplete from './RelateAutocomplete.jsx';
import ImagePicker from './ImagePicker.jsx';
import FilePicker from './FilePicker.jsx';
import UserPicker from './UserPicker.jsx';
import WysiwygEditor from './WysiwygEditor.jsx';
import OEmbedPicker from './OEmbedPicker.jsx';

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
 * special case below. "wysiwyg" (WYSIWYG_Field_Type) is its own rich
 * sibling: same plain-string form state and payload as "textarea" (no
 * special handling needed in `handleSubmit()`/the values initializer at
 * all, only the render branch differs), but renders a `WysiwygEditor`
 * (a real `window.wp.editor.initialize()` TinyMCE/quicktags instance,
 * the same classic editor a post's own content field and ACF's own
 * WYSIWYG field both use) instead of a plain `<textarea>` -- see that
 * component's own docblock for why it's deliberately uncontrolled from
 * React's own side, unlike every other field here. "oembed"
 * (OEmbed_Field_Type) is a plainer case again -- same plain-string form
 * state/payload as "text"/"url" (a genuinely controlled input, unlike
 * "wysiwyg"'s own), just rendering an `OEmbedPicker` (a URL `<input>`
 * plus a live preview from WordPress's own oEmbed proxy) instead of a
 * bare `<input type="url">`. "range" is a real `<input>` type, but a
 * bare slider with no visible number is barely usable, so it gets its
 * own small live readout alongside it.
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
 * widget on top). Each choice is a `{value, label}` pair, not a bare
 * string: `choice.value` is what's actually read/written into this
 * field's own form state and submitted -- a plain string, same as a Text
 * field's -- while `choice.label` is only ever used as the visible
 * option/caption text (a `<select>`'s option text, a radio/button's own
 * label), never itself stored anywhere. "checkboxes" (Checkbox_Field_Type,
 * `is_multiple: true`) is the one multi-selection case: form state and
 * submitted value are both a plain string array of `choice.value`s (`[]`
 * if none checked), matching Checkbox_Field_Type::cast()'s own shape --
 * unrelated to relate_many's `[{id,label}, ...]` above despite the
 * shared "array" shape; nothing here is an id. "boolean" (True_False_Field_Type) is a
 * single native checkbox; its form state and submitted value are both a
 * real JS boolean, not a string -- initialValues coming back as `0`/`1`/
 * `"0"`/`"1"` (a driver that doesn't apply Eloquent's own boolean cast
 * strictly) is coerced with `Boolean()` either way.
 *
 * "image" (Image_Field_Type) and "file" (File_Field_Type) are the other
 * special case whose form state isn't a plain scalar: like relate_one's
 * `{id, label}`, its value can be richer than what the field's own DB
 * column actually stores (a bare attachment id) -- exactly which shape
 * depends on the field's own configured `return_format` (a bare number
 * for `'id'`, a plain URL string for `'url'`, or an enriched object for
 * `'array'` -- `{id, url, width, height, sizes}` for Image, `{id, url,
 * filename, title, mime_type, filesize}` for File, both built by
 * `Records_REST_Controller::resolve_image_value()`/`resolve_file_value()`
 * respectively), so `initialValues` state's own initializer passes it
 * through completely unchanged -- `ImagePicker`/`FilePicker` (rendered
 * in its place below) are what make sense of whichever shape it turns
 * out to be, including normalizing a `'url'`-shaped value back to a real
 * id transparently once it resolves one (see `ImagePicker`'s own
 * docblock for the full "why", identical for both). `handleSubmit()`
 * reduces whatever richer shape is currently in form state back down to
 * a bare id (or `null`) the same way relate_one's own `{id, label}` gets
 * reduced to just `.id`.
 *
 * "user" (User_Field_Type) is Image/File's own close cousin -- its form
 * state can likewise start out richer than the bare WP user id its own
 * DB column stores (a bare number for `return_format: 'id'`, or an
 * enriched `{id, name, email, avatar_url}` object for `'array'` --
 * never a `'url'`-shaped string; see `Field_Type::supports_user_settings()`'s
 * own docblock for why) -- but unlike Image/File, `handleSubmit()` needs
 * NO special-casing for it at all: `UserPicker` (rendered in its place
 * below) normalizes form state down to just the id itself, synchronously
 * on mount, so by the time any submit is possible `values[field.name]`
 * is already the same bare-id-or-`null` shape every other plain field
 * already has (see that component's own docblock for why it can do this
 * up front, unlike Image/File's own `'url'` case which genuinely needs
 * an async round trip first).
 *
 * `field.settings` (Gateway\\Field_Type::presentation_fields(), threaded
 * straight through by Model_Fields::all()/the fields REST route, same as
 * `field.choices`) is read generically here, not gated on `field.type
 * === 'text'` specifically: `[]`/`{}` for every field whose type doesn't
 * recognize any of the fixed catalog (`Model_Fields::sanitize_settings()`
 * already guarantees that server-side), so this component never needs
 * its own per-type list to know when there's nothing to show.
 * `settings.instructions` renders as a small note UNDER the control (not
 * between the label and it -- ACF's own convention this mirrors, and
 * matching where every other per-field description here already lives:
 * Default Value's "Appears when creating a new record.", Character
 * Limit's "Leave blank for no limit.", etc., all sit under their own
 * control too), for any field type. `settings.placeholder`/`step`
 * only ever have anything to show for the one plain `<input>` fallback
 * branch at the bottom (nothing else -- textarea, select, a relate
 * autocomplete, ...) -- currently recognizes them at all -- with one
 * exception: `step` also applies to the dedicated Range branch (see its
 * own `settings.min_value`/`max_value` paragraph below), since Range is
 * the other type `presentation_fields()` grants it to but the only one
 * of the two that doesn't fall into the plain `<input>` fallback at all
 * (it renders its own dedicated `<input type="range">` instead).
 * `settings.prepend`/`append` are similar: the plain `<input>` fallback
 * and the dedicated Range branch both wrap their own control in a small
 * inline group (`.gateway-record-form-input-group`, each addon a
 * `.gateway-record-form-input-addon`) when either is configured --
 * every other branch (textarea, select, a relate autocomplete, ...)
 * still ignores both, since neither Text Area/Select/Relate/etc.
 * recognizes them as a Presentation setting in the first place. `step`
 * only ever comes back non-empty for a Number or Range field (the only
 * types `Field_Type::presentation_fields()` recognizes it for), and
 * passes straight through to the `<input>`'s own `step` attribute
 * unconditionally -- setting `step` on a non-numeric `<input type>` is a
 * silent no-op in every browser, so there's no need to gate it on
 * `inputType === 'number'`/`'range'` here as well.
 *
 * `settings.min_value`/`max_value` (`Field_Type::supports_range_limits()`,
 * Range only -- FieldEditor's own Validation tab, not Presentation)
 * passes straight through to the range `<input>`'s own `min`/`max`
 * attributes below, the same "client hint, server enforces" split
 * `character_limit` has: the real enforcement is
 * `Model_Fields::validate_range_values()` on the server, this is only
 * what keeps the slider's own draggable range honest in the meantime.
 *
 * `settings.default` (`Field_Type::supports_default_value()`, currently
 * Text/Number/Range only -- FieldEditor's own General tab, not
 * Presentation) is different from the rest of `settings` in one way: it
 * only ever applies to a brand new record, never an existing one being
 * edited, so `initialValues` state's own initializer above checks
 * `!initialValues` (true only for "Add New" -- editing always passes a
 * real, even if blank, `initialValues`) before falling back to it,
 * rather than reading it unconditionally the way
 * `instructions`/`placeholder`/etc. do.
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
 *
 * `field.conditional_logic` (`{enabled, groups}` or `null`, threaded
 * straight through by `Model_Fields::all()`/the fields REST route, same
 * as `field.choices`/`field.settings`) decides whether a field renders
 * at all -- `fieldIsVisible()` evaluates it against the CURRENT live
 * `values` state on every render (OR across `groups`, AND within a
 * group's own `rules`), so a field with a configured condition appears
 * and disappears live as whichever OTHER field it depends on changes,
 * with no server round-trip. A rule referencing a relate field compares
 * against that OTHER record's own *label*, not its numeric id -- the
 * only thing meaningful to type a comparison value against; a rule
 * referencing a field that no longer exists on this model at all never
 * blocks its own group (the same graceful-degradation `Model_Fields::
 * is_field_visible_for_data()` already applies server-side, not a
 * second, different rule invented here).
 *
 * A hidden field is genuinely absent, not just visually collapsed:
 * `handleSubmit()` omits it from the submitted payload entirely, so its
 * own already-stored value (if any) is left exactly as it was rather
 * than this form's own blank/default local state for it silently
 * overwriting something real the next time any OTHER field on the same
 * record is saved. This is this component's own half of "as if the
 * field doesn't exist for this record" -- `Model_Fields::
 * validate_required_fields()`/`validate_character_limits()` are the
 * other half, independently reaching the same conclusion server-side
 * (never trusting that a hidden field client-side was actually omitted
 * by every possible caller) before a required-but-hidden field could
 * ever be rejected as missing, or a character-limited-but-hidden one
 * rejected as too long.
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

	// --- Conditional Logic (Gateway\\Field_Type::validate_required_fields()/
	// validate_character_limits()'s own client-side counterpart -- see
	// this component's own docblock's final paragraph) -------------------

	const isEmptyForConditionalLogic = ( value ) => {
		if ( Array.isArray( value ) ) {
			return 0 === value.length;
		}
		if ( 'boolean' === typeof value ) {
			return false === value;
		}
		if ( null === value || undefined === value ) {
			return true;
		}
		return '' === String( value ).trim();
	};

	// A rule's own `field` names some OTHER field on this model; its
	// CURRENT value in `liveValues` needs converting to something
	// comparable against a rule's own plain-string `value` first -- most
	// field types already are (a plain string, or an already-normalized
	// array of strings), but a relate field's own value is `{id, label}`/
	// `[{id, label}, ...]` (see this component's own docblock), so it's
	// that OTHER record's own *label* that's actually meaningful to type
	// a comparison value against, never its numeric id. `undefined` means
	// the referenced field doesn't exist among this model's own current
	// fields at all -- the caller treats that as "can't evaluate this
	// rule," not as an empty value.
	const comparableValueFor = ( fieldName, liveValues ) => {
		const targetField = fields.find( ( field ) => field.name === fieldName );

		if ( ! targetField ) {
			return undefined;
		}

		const targetInputType = inputTypeFor( targetField.type );
		const value = liveValues[ fieldName ];

		if ( 'relate_one' === targetInputType ) {
			return value ? value.label : '';
		}
		if ( 'relate_many' === targetInputType ) {
			return ( value || [] ).map( ( item ) => item.label );
		}
		return value;
	};

	// `null` (not `false`) means "couldn't evaluate this one rule" -- the
	// referenced field no longer exists -- which fieldIsVisible() below
	// treats as vacuously true (never blocking its own group), the same
	// "a dangling rule degrades to not being evaluated, rather than
	// permanently hiding the field" reasoning
	// Gateway\\Model_Fields::is_field_visible_for_data() already applies
	// server-side.
	const ruleMatches = ( rule, liveValues ) => {
		const value = comparableValueFor( rule.field, liveValues );

		if ( undefined === value ) {
			return null;
		}

		const ruleValue = rule.value || '';

		switch ( rule.operator ) {
			case 'has_any_value':
				return ! isEmptyForConditionalLogic( value );
			case 'has_no_value':
				return isEmptyForConditionalLogic( value );
			case 'value_equals':
				return Array.isArray( value )
					? value.some( ( item ) => String( item ) === ruleValue )
					: String( value ?? '' ) === ruleValue;
			case 'value_not_equals':
				return Array.isArray( value )
					? ! value.some( ( item ) => String( item ) === ruleValue )
					: String( value ?? '' ) !== ruleValue;
			case 'value_contains':
				return Array.isArray( value )
					? value.some( ( item ) =>
							String( item ).toLowerCase().includes( ruleValue.toLowerCase() )
					  )
					: String( value ?? '' )
							.toLowerCase()
							.includes( ruleValue.toLowerCase() );
			default:
				return true; // An operator that isn't one of the five recognized ones never blocks a field from showing.
		}
	};

	// OR across `conditional_logic.groups`, AND within a group's own
	// `rules` -- a field with no Conditional Logic configured at all
	// (`null`, or `enabled` false, or no groups) is always visible, the
	// common case for every field that's never had this configured.
	const fieldIsVisible = ( field, liveValues ) => {
		const cl = field.conditional_logic;

		if ( ! cl || ! cl.enabled || ! Array.isArray( cl.groups ) || 0 === cl.groups.length ) {
			return true;
		}

		return cl.groups.some( ( group ) =>
			( group.rules || [] ).every( ( rule ) => {
				const result = ruleMatches( rule, liveValues );
				return null === result ? true : result;
			} )
		);
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
			} else if ( 'image' === inputType || 'file' === inputType || 'user' === inputType ) {
				// Passed through exactly as the record's own GET response
				// gave it -- null, a bare id, a URL string, or the full
				// enriched object, depending on this field's own
				// configured return_format. ImagePicker/FilePicker/
				// UserPicker themselves are what make sense of whichever
				// shape this turns out to be -- see those components' own
				// docblocks. Unlike Image/File, a User field's own
				// return_format never gives a URL string here (see
				// Field_Type::supports_user_settings()'s own docblock for
				// why) -- only a bare id or the enriched object, both
				// already handled generically by "passed through
				// unchanged" either way.
				initial[ field.name ] = existing;
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
			// A hidden field is omitted from the payload entirely, not
			// just skipped visually -- "as if the field doesn't exist for
			// this record" means its own already-stored value (if any)
			// stays exactly as it was, rather than this form's own blank/
			// default local state for it silently overwriting a real
			// value the moment any OTHER field on the same record is
			// saved.
			if ( ! fieldIsVisible( field, values ) ) {
				return;
			}

			const inputType = inputTypeFor( field.type );

			if ( 'relate_one' === inputType ) {
				const selected = values[ field.name ];
				payload[ field.name ] = selected ? selected.id : null;
			} else if ( 'relate_many' === inputType ) {
				payload[ field.name ] = ( values[ field.name ] || [] ).map(
					( item ) => item.id
				);
			} else if ( 'image' === inputType || 'file' === inputType ) {
				// Same reduction Relate to One's own {id, label} gets above
				// -- ImagePicker/FilePicker both keep whatever richer
				// shape they were handed in form state (an object once
				// freshly picked, or whatever the initial GET response
				// gave it), but the field's own DB column only ever
				// stores a bare attachment id. A plain number here
				// (already the id, nothing to reduce) and null both pass
				// through unchanged; a leftover string (return_format
				// 'url', the picker's own id-resolving fetch not done
				// yet) has no id to extract at all, so it's dropped to
				// null rather than sent as something the server would
				// just reject anyway.
				const current = values[ field.name ];
				payload[ field.name ] =
					current && 'object' === typeof current
						? current.id
						: 'number' === typeof current
						? current
						: null;
			} else {
				// Covers "checkboxes" (already a string array) and
				// "boolean" (already a real bool) as-is, alongside every
				// plain-string field type (text/number/textarea/wysiwyg/
				// select/radio/buttons/...) -- none of those need
				// converting either. "user" also falls through to here,
				// unlike "image"/"file" above, even though its own form
				// state can likewise start out as a richer `{id, name,
				// email, avatar_url}` object: UserPicker.jsx itself
				// normalizes that down to a bare id (via its own onChange)
				// the moment it mounts, well before any submit is
				// possible, so by the time this ever runs `values[field.name]`
				// is already just the id (or null) -- see that
				// component's own docblock for why it can do this
				// up-front, in a way Image/File's own `'url'`-shaped
				// value can't (that one needs an async round trip first).
				payload[ field.name ] = values[ field.name ];
			}
		} );

		onSubmit( payload );
	};

	return (
		<form onSubmit={ handleSubmit } className="gateway-record-form">
			{ fields.map( ( field ) => {
				if ( ! fieldIsVisible( field, values ) ) {
					return null;
				}

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
						{ 'range' === inputType &&
							( field.settings?.prepend || field.settings?.append ? (
								<span className="gateway-record-form-input-group">
									{ field.settings.prepend && (
										<span className="gateway-record-form-input-addon">
											{ field.settings.prepend }
										</span>
									) }
									<input
										id={ inputId }
										type="range"
										min={ field.settings?.min_value ?? undefined }
										max={ field.settings?.max_value ?? undefined }
										step={ field.settings?.step || undefined }
										value={ values[ field.name ] || 0 }
										onChange={ handleChange( field.name ) }
									/>{ ' ' }
									<output>{ values[ field.name ] || 0 }</output>
									{ field.settings.append && (
										<span className="gateway-record-form-input-addon">
											{ field.settings.append }
										</span>
									) }
								</span>
							) : (
								<>
									<input
										id={ inputId }
										type="range"
										min={ field.settings?.min_value ?? undefined }
										max={ field.settings?.max_value ?? undefined }
										step={ field.settings?.step || undefined }
										value={ values[ field.name ] || 0 }
										onChange={ handleChange( field.name ) }
									/>{ ' ' }
									<output>{ values[ field.name ] || 0 }</output>
								</>
							) ) }
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
									<option key={ choice.value } value={ choice.value }>
										{ choice.label }
									</option>
								) ) }
							</select>
						) }
						{ 'radio' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<label
									key={ choice.value }
									className="gateway-record-form-choice"
								>
									<input
										type="radio"
										name={ inputId }
										value={ choice.value }
										checked={ values[ field.name ] === choice.value }
										onChange={ handleChange( field.name ) }
									/>{ ' ' }
									{ choice.label }
								</label>
							) ) }
						{ 'buttons' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<button
									key={ choice.value }
									type="button"
									className={
										'button' +
										( values[ field.name ] === choice.value
											? ' button-primary'
											: '' )
									}
									onClick={ () =>
										handleButtonSelect( field.name )(
											choice.value
										)
									}
								>
									{ choice.label }
								</button>
							) ) }
						{ 'checkboxes' === inputType &&
							( field.choices || [] ).map( ( choice ) => (
								<label
									key={ choice.value }
									className="gateway-record-form-choice"
								>
									<input
										type="checkbox"
										checked={ (
											values[ field.name ] || []
										).includes( choice.value ) }
										onChange={ handleCheckboxToggle(
											field.name,
											choice.value
										) }
									/>{ ' ' }
									{ choice.label }
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
						{ 'image' === inputType && (
							<ImagePicker
								field={ field }
								value={ values[ field.name ] }
								onChange={ ( newValue ) =>
									setValues( ( current ) => ( {
										...current,
										[ field.name ]: newValue,
									} ) )
								}
							/>
						) }
						{ 'file' === inputType && (
							<FilePicker
								field={ field }
								value={ values[ field.name ] }
								onChange={ ( newValue ) =>
									setValues( ( current ) => ( {
										...current,
										[ field.name ]: newValue,
									} ) )
								}
							/>
						) }
						{ 'wysiwyg' === inputType && (
							<WysiwygEditor
								field={ field }
								value={ values[ field.name ] }
								onChange={ ( newValue ) =>
									setValues( ( current ) => ( {
										...current,
										[ field.name ]: newValue,
									} ) )
								}
							/>
						) }
						{ 'oembed' === inputType && (
							<OEmbedPicker
								field={ field }
								value={ values[ field.name ] }
								onChange={ ( newValue ) =>
									setValues( ( current ) => ( {
										...current,
										[ field.name ]: newValue,
									} ) )
								}
							/>
						) }
						{ 'user' === inputType && (
							<UserPicker
								value={ values[ field.name ] }
								onChange={ ( newValue ) =>
									setValues( ( current ) => ( {
										...current,
										[ field.name ]: newValue,
									} ) )
								}
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
							'image' !== inputType &&
							'file' !== inputType &&
							'wysiwyg' !== inputType &&
							'oembed' !== inputType &&
							'user' !== inputType &&
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
						{ field.settings?.instructions && (
							<span className="description gateway-record-form-instructions">
								{ field.settings.instructions }
							</span>
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
