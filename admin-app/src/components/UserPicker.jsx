import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const DEBOUNCE_MS = 300;

/**
 * A User field's own control -- search-and-select for one of this site's
 * own registered WP users, backed by `GET /gateway/v1/users/search`
 * (`User_REST_Controller`), rather than a plain `<select>` -- the same
 * "search a possibly large table instead of rendering every row as an
 * option" reasoning `RelateAutocomplete.jsx` already gives for Relate to
 * One/Relate to Many, just single-select only (this plugin's own "User"
 * field, unlike ACF's, has no multi-select variant -- picking several
 * users is a separate, unimplemented feature, not this component's job)
 * and pointed at `wp_users` instead of a Gateway model's own records.
 *
 * `value` -- like an Image/File field's own attachment id -- can be
 * richer than the bare WP user id `User_Field_Type`'s own DB column
 * actually stores: for an EXISTING record, it's whatever shape the
 * field's configured `return_format` gave the record's own GET response
 * (a bare number for `'id'`, or the enriched `{id, name, email,
 * avatar_url}` object for `'array'` -- see `Field_Type::supports_user_settings()`'s
 * own docblock for why there's no third, `'url'`-shaped case the way
 * Image/File have). Unlike Image/File, though, this component always
 * normalizes form state down to just the bare id, right on mount,
 * regardless of which shape it started as -- there's no in-between
 * "keep the richer shape until submit" step to reduce later in
 * `RecordForm`'s own `handleSubmit()`, because there's no `'url'`-shaped
 * case here that would need to KEEP something other than the id around
 * for later re-resolution the way Image/File's own `'url'` format does.
 * A `return_format: 'array'` value's own `{id, name, ...}` shape is read
 * once, to seed this component's own internal chip, and `onChange( value.id )`
 * fires immediately after -- the same "one-time, transparent
 * normalization... not a change the person editing the record ever
 * sees" already established by `ImagePicker.jsx`'s own identical
 * treatment of its `'url'`-shaped value, just simpler here since it's
 * never asynchronous (nothing to fetch -- the object already has
 * everything this component needs).
 *
 * A bare numeric `value` (`return_format: 'id'`) has the opposite
 * problem Image/File's own bare id has: nothing to render a chip from
 * without an extra round trip. `GET /gateway/v1/users/<id>` resolves the
 * same `{id, label}` shape `search_users()` itself returns, purely for
 * that preview -- the form's own value stays just the id regardless, no
 * `onChange()` call needed for this case (it's already exactly the
 * shape this field is meant to store).
 */
export default function UserPicker( { value, onChange } ) {
	const [ selectedUser, setSelectedUser ] = useState( null ); // {id, label} | null
	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );
	const containerRef = useRef( null );

	useEffect( () => {
		if ( null === value || undefined === value || '' === value ) {
			setSelectedUser( null );
			return;
		}

		if ( 'object' === typeof value ) {
			setSelectedUser( { id: value.id, label: value.name } );
			onChange( value.id );
			return;
		}

		let cancelled = false;

		// A bare id (return_format 'id') -- fetch just enough to render a
		// chip from; the form's own value stays just the id regardless.
		apiFetch( `/users/${ value }` )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setSelectedUser( data );
				}
			} )
			.catch( () => {
				if ( ! cancelled ) {
					// Couldn't resolve it back to a real user (deleted
					// since, e.g.) -- still show SOMETHING rather than a
					// blank picker.
					setSelectedUser( { id: value, label: `User #${ value }` } );
				}
			} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onChange
		// intentionally excluded: RecordForm passes a fresh closure every
		// render, and including it here would re-run this effect on every
		// keystroke elsewhere in the form, not just when this field's own
		// value actually changes (same reasoning ImagePicker.jsx's own
		// identical effect already documents).
	}, [ value ] );

	useEffect( () => {
		if ( ! open ) {
			return;
		}

		let cancelled = false;
		setLoading( true );

		const handle = setTimeout( () => {
			const params = new URLSearchParams();
			if ( query ) {
				params.set( 'q', query );
			}
			if ( selectedUser ) {
				params.set( 'exclude', String( selectedUser.id ) );
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
	}, [ query, open, selectedUser ] );

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
		setSelectedUser( option );
		onChange( option.id );
		setQuery( '' );
		setOpen( false );
	};

	const handleRemove = () => {
		setSelectedUser( null );
		onChange( null );
	};

	return (
		<div className="gateway-user-picker" ref={ containerRef }>
			{ selectedUser && (
				<span className="gateway-user-picker-chip">
					{ selectedUser.label }
					<button
						type="button"
						className="gateway-user-picker-remove"
						onClick={ handleRemove }
						aria-label={ `Remove ${ selectedUser.label }` }
					>
						×
					</button>
				</span>
			) }

			{ ! selectedUser && (
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
