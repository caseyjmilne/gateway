import { useEffect, useRef, useState } from 'react';
import { fetchPostOption, searchPosts } from '../api.js';

/**
 * `Post_Object_Field_Type`'s own record-editor control -- ACF's own Post
 * Object field, copied per a direct request: "we need a Post Object
 * field type (same as ACF equivalent)... Each of these is an
 * autocomplete searchable of the relevant data. User can select
 * multiple, there needs to be a way to remove them a delete button."
 * `RelateAutocomplete.jsx`'s own search-box-plus-removable-chips widget,
 * just searching this site's own WordPress posts (`searchPosts()`,
 * `Post_REST_Controller::search_posts()`) instead of one particular
 * Gateway model's own records, and narrowed by this field's own
 * `settings.filter_post_types`/`filter_post_statuses`/`filter_taxonomies`
 * (passed straight through to `searchPosts()`, which turns them into
 * this search's own request params).
 *
 * `value`/`onChange` both work in the same `{id, label}` (single) or
 * `[{id, label}, ...]` (multiple) chip shape `RelateAutocomplete.jsx`'s
 * own `value`/`onChange` already use -- `RecordForm`'s own
 * `handleSubmit()` is what reduces that back down to a bare array of
 * ids at submit time (storage is always an array regardless of
 * `settings.multiple` -- see `Post_Object_Field_Type`'s own docblock),
 * the same "richer shape in form state, reduced to bare id(s) only when
 * building the payload" split `ImagePicker.jsx`'s own `value` already
 * has for `return_format` `'id'`/`'url'`.
 *
 * An EXISTING record's own value, though, arrives in whatever shape
 * `field.settings.return_format` gave it: the full `{id, title,
 * permalink, post_type, status}` object (`'object'`, the default) or a
 * bare post id (`'id'`) -- either way, one entry per post, either a
 * single one or an array of them depending on `field.settings.multiple`.
 * This component normalizes ALL of those into the `{id, label}` chip
 * shape as it renders: an `'object'`-shaped entry's own `title` becomes
 * `label` directly (no fetch needed); a bare id has nothing to build a
 * label from, so it's resolved via `fetchPostOption()` (`GET
 * /gateway/v1/posts/<id>`) -- the same "return_format 'id' has nothing
 * else to build a preview from" gap `ImagePicker.jsx`'s own bare-id
 * branch already fills for its own type -- cached in `resolvedById`
 * (keyed by post id) purely for rendering, so the same id is never
 * re-fetched twice; the form's own value is never rewritten to hold
 * that richer shape the way it never is for Image's own bare-id case
 * either.
 */
export default function PostObjectPicker( { field, value, onChange } ) {
	const settings = field.settings || {};
	const multiple = !! settings.multiple;

	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );
	const [ resolvedById, setResolvedById ] = useState( {} );
	const containerRef = useRef( null );

	// Whatever shape `value` currently has, reduce it to a plain array of
	// raw entries (an 'object'-shaped record, a bare id, or an
	// already-normalized {id,label} chip from a pick made this session)
	// so everything below can treat single/multiple the same way.
	const rawEntries = multiple
		? Array.isArray( value )
			? value
			: []
		: value
		? [ value ]
		: [];
	const rawEntriesKey = JSON.stringify( rawEntries );

	// Resolve any bare-id entry not already cached -- mirrors
	// ImagePicker.jsx's own bare-id-needs-a-follow-up-fetch effect.
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
				fetchPostOption( id ).catch( () => ( {
					id,
					label: `(#${ id })`,
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
				label: entry.label || entry.title || `(#${ entry.id })`,
			};
		}

		const id = Number( entry );
		return resolvedById[ id ] || { id, label: `#${ id }` };
	} );

	const showSearch = multiple || 0 === selected.length;
	const excludeIds = selected.map( ( item ) => item.id );
	const settingsKey = JSON.stringify( settings );

	useEffect( () => {
		if ( ! open || ! showSearch ) {
			return;
		}

		let cancelled = false;
		setLoading( true );

		const handle = setTimeout( () => {
			searchPosts( settings, query, excludeIds )
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
	}, [ query, open, showSearch, settingsKey, excludeIds.join( ',' ) ] );

	// Close the results dropdown on an outside click, same as
	// RelateAutocomplete.jsx's own identical effect.
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
		const chip = { id: option.id, label: option.label };

		if ( multiple ) {
			onChange( [ ...selected, chip ] );
			setQuery( '' );
			// Left open deliberately -- the whole point of "select
			// multiple" is picking one, then continuing to search and
			// pick more, same as RelateAutocomplete.jsx's own belongsToMany
			// case.
		} else {
			onChange( chip );
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
		<div className="gateway-post-object-picker" ref={ containerRef }>
			{ selected.length > 0 && (
				<ul className="gateway-post-object-picker-chips">
					{ selected.map( ( item ) => (
						<li
							key={ item.id }
							className="gateway-post-object-picker-chip"
						>
							{ item.label }
							<button
								type="button"
								className="gateway-post-object-picker-remove"
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
				<div className="gateway-post-object-picker-search">
					<input
						type="text"
						className="regular-text"
						placeholder="Search posts…"
						value={ query }
						onFocus={ () => setOpen( true ) }
						onChange={ ( event ) => {
							setQuery( event.target.value );
							setOpen( true );
						} }
					/>
					{ open && (
						<ul className="gateway-post-object-picker-results">
							{ loading && (
								<li className="gateway-post-object-picker-empty">
									Searching…
								</li>
							) }
							{ ! loading && 0 === results.length && (
								<li className="gateway-post-object-picker-empty">
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
											<span>{ option.label }</span>
											<span className="gateway-post-object-picker-type">
												{ option.type }
											</span>
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
