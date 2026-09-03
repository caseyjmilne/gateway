import { useEffect, useRef, useState } from 'react';

/**
 * `Post_Object_Field_Type`'s own "Filter by Post Type"/"Filter by Post
 * Status"/"Filter by Taxonomy" settings -- each "an autocomplete
 * searchable of the relevant data. User can select multiple, there
 * needs to be a way to remove them a delete button," per the original
 * request. `RelateAutocomplete.jsx`'s own chips-plus-search shape, but
 * searching a small, already-fetched, CLIENT-side `options` list
 * (this site's own registered post types/taxonomies, or a fixed post
 * -statuses list -- see `usePostTypes.js`/`useTaxonomies.js` and
 * `FieldEditor.jsx`'s own `POST_STATUS_OPTIONS`) rather than
 * `RelateAutocomplete`'s own per-keystroke server search -- there's no
 * "page" of post types on a real site large enough to need one.
 *
 * `value` is a plain array of option `value`s (matching exactly what
 * `Model_Fields::sanitize_settings()`'s own array-valued special case
 * for these three keys stores) -- NOT `{value, label}` chip objects the
 * way `RelateAutocomplete`'s own `value` is -- `options` is what turns
 * a stored value back into a label for display.
 */
export default function FilterMultiSelect( {
	options,
	value,
	onChange,
	placeholder,
} ) {
	const selectedValues = value || [];
	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const containerRef = useRef( null );

	const labelFor = ( optionValue ) =>
		options.find( ( option ) => option.value === optionValue )?.label ||
		optionValue;

	const availableOptions = options.filter(
		( option ) =>
			! selectedValues.includes( option.value ) &&
			( ! query ||
				option.label.toLowerCase().includes( query.toLowerCase() ) )
	);

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

		document.addEventListener( 'mousedown', handleClickOutside );
		return () =>
			document.removeEventListener( 'mousedown', handleClickOutside );
	}, [ open ] );

	const handleSelect = ( optionValue ) => {
		onChange( [ ...selectedValues, optionValue ] );
		setQuery( '' );
		// Left open deliberately -- same "keep picking" reasoning
		// RelateAutocomplete.jsx's own belongsToMany case already gives.
	};

	const handleRemove = ( optionValue ) => {
		onChange( selectedValues.filter( ( item ) => item !== optionValue ) );
	};

	return (
		<div className="gateway-filter-multi-select" ref={ containerRef }>
			{ selectedValues.length > 0 && (
				<ul className="gateway-filter-multi-select-chips">
					{ selectedValues.map( ( optionValue ) => (
						<li
							key={ optionValue }
							className="gateway-filter-multi-select-chip"
						>
							{ labelFor( optionValue ) }
							<button
								type="button"
								className="gateway-filter-multi-select-remove"
								onClick={ () => handleRemove( optionValue ) }
								aria-label={ `Remove ${ labelFor(
									optionValue
								) }` }
							>
								×
							</button>
						</li>
					) ) }
				</ul>
			) }

			<div className="gateway-filter-multi-select-search">
				<input
					type="text"
					className="regular-text"
					placeholder={ placeholder || 'Search…' }
					value={ query }
					onFocus={ () => setOpen( true ) }
					onChange={ ( event ) => {
						setQuery( event.target.value );
						setOpen( true );
					} }
				/>
				{ open && (
					<ul className="gateway-filter-multi-select-results">
						{ 0 === availableOptions.length && (
							<li className="gateway-filter-multi-select-empty">
								No matches.
							</li>
						) }
						{ availableOptions.map( ( option ) => (
							<li key={ option.value }>
								<button
									type="button"
									onClick={ () => handleSelect( option.value ) }
								>
									{ option.label }
								</button>
							</li>
						) ) }
					</ul>
				) }
			</div>
		</div>
	);
}
