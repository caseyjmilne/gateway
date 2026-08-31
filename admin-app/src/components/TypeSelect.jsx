import { useEffect, useRef, useState } from 'react';

// The same six groups ACF itself files its own field types under --
// Gateway\Field_Type::category()'s own fixed vocabulary. Fixed order,
// not alphabetical or however `fieldTypes` happens to arrive: this is
// what actually determines the picker's own section order regardless of
// which order Field_Type_Registry::all() registered its classes in.
const CATEGORY_ORDER = [ 'Basic', 'Content', 'Choice', 'Relational', 'Advanced', 'Layout' ];

/**
 * A searchable, ACF-style Type picker for `FieldEditor`'s own General
 * tab -- replaces a plain `<select>` (unusable once there are more than
 * a handful of field types to scroll through, and gave no sense of which
 * types are related to each other) with a small popover: a search box
 * filtering by label, and the remaining options grouped under the same
 * six category headings ACF's own "Add Field" type picker uses
 * (`Field_Type::category()`, purely cosmetic metadata -- see that
 * method's own docblock).
 *
 * Deliberately driven by `Controller` from the caller (a plain `value`/
 * `onChange` pair), not `register()` -- there's no native form element
 * here for react-hook-form to attach a ref to, the same reason
 * `RelateAutocomplete`/`ImagePicker`/`FilePicker` are all driven the same
 * way instead of `register()`.
 *
 * Structurally mirrors `RelateAutocomplete.jsx`'s own search-and-select
 * pattern (a `containerRef` closing the panel on an outside click, a
 * search `<input>` opening it on focus) -- the search here is a plain
 * client-side filter over an already-fully-known `fieldTypes` list
 * rather than a debounced server request, since every field type is
 * already loaded up front (`useFieldTypes()`), unlike a Relate field's
 * own potentially large related table.
 *
 * `ariaLabel`, passed straight to the toggle button, exists because the
 * caller can't just wrap this in a `<label>` the way it would a plain
 * `<input>`/`<select>` -- see `FieldEditor.jsx`'s own comment at its
 * call site for why a real `<label>` around a widget with more than one
 * of its own buttons (the toggle, every option) actively breaks it (the
 * browser re-forwards a click on any OTHER button here to the toggle,
 * the label's own implicit "labeled control", reopening the panel the
 * instant a pick closes it).
 *
 * `disabledKeys` (an array of `Field_Type::key()` values, e.g.
 * `['permalink']`) greys out -- shown, but unclickable, with a `title`
 * explaining why -- rather than hiding, any option in that list: what
 * `FieldEditor.jsx` passes for a `max_one_per_model()` type the model
 * already has configured on some OTHER field, the client-side echo of
 * the same check `Model_Fields::add()`/`update()` already enforce
 * server-side (this doesn't replace that -- it's just a clearer failure
 * mode than picking it here and only finding out it's rejected once
 * autosave actually runs).
 */
export default function TypeSelect( { fieldTypes, value, onChange, disabled, ariaLabel, disabledKeys = [] } ) {
	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const containerRef = useRef( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}

		const handleClickOutside = ( event ) => {
			if (
				containerRef.current &&
				! containerRef.current.contains( event.target )
			) {
				setOpen( false );
			}
		};
		const handleKeyDown = ( event ) => {
			if ( 'Escape' === event.key ) {
				setOpen( false );
			}
		};

		document.addEventListener( 'mousedown', handleClickOutside );
		document.addEventListener( 'keydown', handleKeyDown );
		return () => {
			document.removeEventListener( 'mousedown', handleClickOutside );
			document.removeEventListener( 'keydown', handleKeyDown );
		};
	}, [ open ] );

	const selectedType = fieldTypes.find( ( type ) => type.key === value );

	const matching = fieldTypes.filter( ( type ) =>
		type.label.toLowerCase().includes( query.trim().toLowerCase() )
	);

	// Grouped by CATEGORY_ORDER's own fixed sequence, not the order
	// `matching` happens to be in -- a category with nothing currently
	// matching (or nothing registered in it at all, e.g. Advanced/Layout
	// today) is left out entirely rather than showing an empty heading.
	const groups = CATEGORY_ORDER.map( ( category ) => ( {
		category,
		options: matching.filter( ( type ) => type.category === category ),
	} ) ).filter( ( group ) => group.options.length > 0 );

	const handleSelect = ( key ) => {
		onChange( key );
		setQuery( '' );
		setOpen( false );
	};

	return (
		<div
			className={
				'gateway-type-select' +
				( disabled ? ' gateway-type-select-disabled' : '' )
			}
			ref={ containerRef }
		>
			<button
				type="button"
				className="gateway-type-select-toggle"
				disabled={ disabled }
				aria-label={ ariaLabel }
				onClick={ () => setOpen( ( current ) => ! current ) }
			>
				<span>{ selectedType ? selectedType.label : 'Select a type…' }</span>
				<span className="gateway-type-select-chevron" aria-hidden="true">
					▾
				</span>
			</button>
			{ open && ! disabled && (
				<div className="gateway-type-select-panel">
					<input
						type="text"
						className="gateway-type-select-search"
						placeholder="Type to search…"
						value={ query }
						onChange={ ( event ) => setQuery( event.target.value ) }
						autoFocus // eslint-disable-line jsx-a11y/no-autofocus -- opening this popover IS the request to type into it, the same reasoning RelateAutocomplete's own search box has for stealing focus on open.
					/>
					<div className="gateway-type-select-list">
						{ 0 === groups.length && (
							<p className="gateway-type-select-empty">
								No matching field types.
							</p>
						) }
						{ groups.map( ( { category, options } ) => (
							<div key={ category } className="gateway-type-select-group">
								<div className="gateway-type-select-group-heading">
									{ category }
								</div>
								{ options.map( ( type ) => {
									const isDisabled = disabledKeys.includes( type.key );
									return (
										<button
											key={ type.key }
											type="button"
											className={
												'gateway-type-select-option' +
												( type.key === value
													? ' gateway-type-select-option-selected'
													: '' ) +
												( isDisabled
													? ' gateway-type-select-option-disabled'
													: '' )
											}
											disabled={ isDisabled }
											title={
												isDisabled
													? `${ type.label } is already in use on this model and can only be added once.`
													: undefined
											}
											onClick={ () => handleSelect( type.key ) }
										>
											<span>{ type.label }</span>
											{ type.key === value && (
												<span aria-hidden="true">✓</span>
											) }
										</button>
									);
								} ) }
							</div>
						) ) }
					</div>
				</div>
			) }
		</div>
	);
}
