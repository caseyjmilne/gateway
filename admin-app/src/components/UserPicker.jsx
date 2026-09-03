import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const DEBOUNCE_MS = 300;

/**
 * A User field's own control -- search-and-select for one or more of
 * this site's own registered WP users, backed by
 * `GET /gateway/v1/users/search` (`User_REST_Controller`), rather than a
 * plain `<select>` -- the same "search a possibly large table instead of
 * rendering every row as an option" reasoning `RelateAutocomplete.jsx`
 * already gives for Relate to One/Relate to Many -- pointed at
 * `wp_users` instead of a Gateway model's own records.
 *
 * `PostObjectPicker.jsx`'s own close cousin -- this type originally
 * shipped single-select only (with `onChange()` firing a bare id
 * directly, no chip shape at all), reported directly, much later,
 * alongside Filter by Role: "ensure user has these settings: Filter by
 * Role Return Format Select Multiple Required Instructions." Adding
 * Select Multiple meant this component needed the SAME "richer
 * `{id, label}` chip in form state, reduced to a bare array of ids only
 * at submit time" shape `PostObjectPicker.jsx`/`RelateAutocomplete.jsx`
 * already use, rather than normalizing to a bare id immediately on its
 * own the way this component used to -- see `User_Field_Type`'s own
 * docblock for why the underlying storage had to become a plain array
 * either way, regardless of `settings.multiple`.
 *
 * An EXISTING record's own value arrives in whatever shape
 * `field.settings.return_format` gave it: the enriched `{id, name,
 * email, avatar_url}` object (`'array'`, the default) or a bare user id
 * (`'id'`) -- either way, one entry per user, either a single one or an
 * array of them depending on `field.settings.multiple`. This component
 * normalizes ALL of those into the `{id, label}` chip shape as it
 * renders: an object entry's own `name` becomes `label` directly (no
 * fetch needed); a bare id has nothing to build a label from, so it's
 * resolved via `GET /gateway/v1/users/<id>` purely for display, cached
 * locally by id -- the exact same "return_format 'id' has nothing else
 * to build a preview from" gap `PostObjectPicker.jsx`'s own bare-id
 * branch already fills for its own type.
 */
export default function UserPicker( { field, value, onChange } ) {
	const settings = field.settings || {};
	const multiple = !! settings.multiple;

	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );
	const [ resolvedById, setResolvedById ] = useState( {} );
	const containerRef = useRef( null );

	// Whatever shape `value` currently has, reduce it to a plain array of
	// raw entries (an enriched record, a bare id, or an already
	// -normalized {id,label} chip from a pick made this session) so
	// everything below can treat single/multiple the same way.
	const rawEntries = multiple
		? Array.isArray( value )
			? value
			: []
		: value
		? [ value ]
		: [];
	const rawEntriesKey = JSON.stringify( rawEntries );

	// Resolve any bare-id entry not already cached -- mirrors
	// PostObjectPicker.jsx's own bare-id-needs-a-follow-up-fetch effect.
	useEffect( () => {
		const idsNeedingResolve = rawEntries
			.filter( ( entry ) => 'object' !== typeof entry || null === entry )
			.map( ( entry ) => Number( entry ) )
			.filter( ( id ) => id && ! resolvedById[ id ] );

		if ( 0 === idsNeedingResolve.length ) {
			return;
		}

		let cancelled = false;

		Promise.all(
			idsNeedingResolve.map( ( id ) =>
				apiFetch( `/users/${ id }` ).catch( () => ( {
					id,
					label: `User #${ id }`,
				} ) )
			)
		).then( ( fetched ) => {
			if ( cancelled ) {
				return;
			}

			setResolvedById( ( previous ) => {
				const next = { ...previous };
				fetched.forEach( ( option ) => {
					next[ option.id ] = option;
				} );
				return next;
			} );
		} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ rawEntriesKey ] );

	const selected = rawEntries.map( ( entry ) => {
		if ( 'object' === typeof entry && null !== entry ) {
			return {
				id: entry.id,
				label: entry.label || entry.name || `User #${ entry.id }`,
			};
		}

		const id = Number( entry );
		return resolvedById[ id ] || { id, label: `User #${ id }` };
	} );

	const showSearch = multiple || 0 === selected.length;
	const excludeIds = selected.map( ( item ) => item.id );
	const filterRoles = settings.filter_roles || [];
	const filterRolesKey = filterRoles.join( ',' );

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
			if ( excludeIds.length ) {
				params.set( 'exclude', excludeIds.join( ',' ) );
			}
			if ( filterRoles.length ) {
				params.set( 'role', filterRoles.join( ',' ) );
			}

			apiFetch( `/users/search?${ params.toString() }` )
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
		}, DEBOUNCE_MS );

		return () => {
			cancelled = true;
			clearTimeout( handle );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ query, open, showSearch, filterRolesKey, excludeIds.join( ',' ) ] );

	// Close the results dropdown on an outside click -- same as
	// RelateAutocomplete.jsx's own identical behavior.
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
			// Left open deliberately -- same "keep picking" reasoning
			// RelateAutocomplete.jsx's own belongsToMany case already gives.
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
		<div className="gateway-user-picker" ref={ containerRef }>
			{ selected.length > 0 && (
				<ul className="gateway-user-picker-chips">
					{ selected.map( ( item ) => (
						<li key={ item.id } className="gateway-user-picker-chip">
							{ item.label }
							<button
								type="button"
								className="gateway-user-picker-remove"
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
				<div className="gateway-user-picker-search">
					<input
						type="text"
						className="regular-text"
						placeholder="Search users…"
						value={ query }
						onFocus={ () => setOpen( true ) }
						onChange={ ( event ) => {
							setQuery( event.target.value );
							setOpen( true );
						} }
					/>
					{ open && (
						<ul className="gateway-user-picker-results">
							{ loading && (
								<li className="gateway-user-picker-empty">
									Searching…
								</li>
							) }
							{ ! loading && 0 === results.length && (
								<li className="gateway-user-picker-empty">
									No matches.
								</li>
							) }
							{ ! loading &&
								results.map( ( option ) => (
									<li key={ option.id }>
										<button
											type="button"
											onClick={ () => handleSelect( option ) }
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
