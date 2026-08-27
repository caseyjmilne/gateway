import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

/**
 * Search-and-select UI for a "Relate to One"/"Relate to Many" field --
 * backed by GET /gateway/v1/models/<class>/records/search, which searches
 * the related model by its own display field (see Records_REST_Controller::
 * resolve_display_field()) and returns just `{id, label}` pairs.
 *
 * Deliberately not a plain `<select>` -- the whole point of these two
 * field types (per the feature request) is searching a possibly large
 * related table rather than rendering every row as an option.
 *
 * `multiple` is the only thing distinguishing "Relate to One" from
 * "Relate to Many" here: with it false, `value` is a single `{id, label}`
 * (or null) and picking a result replaces it outright; with it true,
 * `value` is an array and picking a result appends to it, leaving the
 * search box open for further picks. Either way, `exclude` (comma
 * -joined already-selected ids) is sent on every search so an already
 * -picked record never reappears in its own results -- for "Relate to
 * One" this just keeps the currently-selected record out of the list
 * while its own search box is showing (selecting a new one still simply
 * replaces it), for "Relate to Many" it's what actually prevents picking
 * the same record twice.
 *
 * Every selected chip carries its own "×" remove button -- the feature's
 * own explicit requirement that a selected related record must be
 * removable.
 */
export default function RelateAutocomplete( {
	relatedModel,
	multiple,
	value,
	onChange,
} ) {
	const selected = multiple ? value || [] : value ? [ value ] : [];
	const showSearch = multiple || 0 === selected.length;

	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );
	const containerRef = useRef( null );

	const excludeParam = selected.map( ( item ) => item.id ).join( ',' );

	useEffect( () => {
		if ( ! open || ! showSearch ) {
			return;
		}

		let cancelled = false;
		setLoading( true );

		const handle = setTimeout( () => {
			const params = new URLSearchParams();
			if ( query ) {
				params.set( 'q', query );
			}
			if ( excludeParam ) {
				params.set( 'exclude', excludeParam );
			}

			apiFetch(
				`/models/${ encodeURIComponent(
					relatedModel
				) }/records/search?${ params.toString() }`
			)
				.then( ( data ) => {
					if ( ! cancelled ) {
						setResults( data );
					}
				} )
				.catch( () => {
					if ( ! cancelled ) {
						setResults( [] );
					}
				} )
				.finally( () => {
					if ( ! cancelled ) {
						setLoading( false );
					}
				} );
		}, 300 );

		return () => {
			cancelled = true;
			clearTimeout( handle );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ query, open, showSearch, relatedModel, excludeParam ] );

	// Close the results dropdown on an outside click -- otherwise it stays
	// open forever once a search has happened, covering whatever's below it.
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

	const handleSelect = ( option ) => {
		if ( multiple ) {
			onChange( [ ...selected, option ] );
			setQuery( '' );
			// Left open deliberately -- belongsToMany's whole point is
			// picking one, then continuing to search and pick more.
		} else {
			onChange( option );
			setQuery( '' );
			setOpen( false );
		}
	};

	const handleRemove = ( id ) => {
		onChange(
			multiple ? selected.filter( ( item ) => item.id !== id ) : null
		);
	};

	return (
		<div className="gateway-relate-autocomplete" ref={ containerRef }>
			{ selected.length > 0 && (
				<ul className="gateway-relate-autocomplete-chips">
					{ selected.map( ( item ) => (
						<li
							key={ item.id }
							className="gateway-relate-autocomplete-chip"
						>
							{ item.label }
							<button
								type="button"
								className="gateway-relate-autocomplete-remove"
								onClick={ () => handleRemove( item.id ) }
								aria-label={ `Remove ${ item.label }` }
							>
								×
							</button>
						</li>
					) ) }
				</ul>
			) }

			{ showSearch && (
				<div className="gateway-relate-autocomplete-search">
					<input
						type="text"
						className="regular-text"
						placeholder="Search…"
						value={ query }
						onFocus={ () => setOpen( true ) }
						onChange={ ( event ) => {
							setQuery( event.target.value );
							setOpen( true );
						} }
					/>
					{ open && (
						<ul className="gateway-relate-autocomplete-results">
							{ loading && (
								<li className="gateway-relate-autocomplete-empty">
									Searching…
								</li>
							) }
							{ ! loading && 0 === results.length && (
								<li className="gateway-relate-autocomplete-empty">
									No matches.
								</li>
							) }
							{ ! loading &&
								results.map( ( option ) => (
									<li key={ option.id }>
										<button
											type="button"
											onClick={ () =>
												handleSelect( option )
											}
										>
											{ option.label }
										</button>
									</li>
								) ) }
						</ul>
					) }
				</div>
			) }
		</div>
	);
}
