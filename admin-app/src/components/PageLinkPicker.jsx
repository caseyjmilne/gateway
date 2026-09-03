import { useEffect, useRef, useState } from 'react';
import { resolvePageLink, searchPageLinks } from '../api.js';

/**
 * `Page_Link_Field_Type`'s own record-editor control -- ACF's own Page
 * Link field, copied per a direct request: "we need a Page Link similar
 * to ACF page link with following options supported: Page Link
 * page_link Filter by Post Type Filter by Post Status Filter by
 * Taxonomy Allow Archive URL's Select Multiple Required Instructions.
 * The resulting UI is a searchable select and the items are organized
 * as shown in the screenshot." `PostObjectPicker.jsx`'s own close
 * cousin -- same chips-plus-search shape, same `searchPosts()`-style
 * live search (`searchPageLinks()` here instead) -- with two real
 * differences: results are GROUPED (a small heading over each cluster,
 * "Archives" first if present, then one heading per matching post
 * type's own label -- copying the screenshot's own "Archives"/"Post"
 * layout), and `value`/`onChange` carry a URL, never a post id (see
 * `Page_Link_Field_Type`'s own docblock for why an archive URL has no
 * post id to have in the first place).
 *
 * `value`/`onChange` work in the same "richer chip in form state,
 * reduced at submit time" shape every other structured `RecordForm`
 * control already uses -- a single `{value, label, group}` object, or
 * an array of them for `settings.multiple`. An EXISTING record's own
 * value, though, is always JUST a bare URL string (or array of URL
 * strings, or `null`) -- `Records_REST_Controller::enrich_page_link_fields()`
 * never resolves it any further than that (there's no return_format to
 * resolve it THROUGH -- again, see that type's own docblock). A bare
 * URL has nothing to build a label from, so it's resolved via
 * `resolvePageLink()` (`GET /gateway/v1/page-links/resolve`) purely for
 * display, cached locally by URL so the same one is never re-fetched
 * twice -- the same "return_format 'id' has nothing else to build a
 * preview from" gap `ImagePicker.jsx`'s own bare-id branch fills for
 * its own type, `PostObjectPicker.jsx`'s own bare-id branch fills for
 * its, just keyed by URL instead of id here.
 */
export default function PageLinkPicker( { field, value, onChange } ) {
	const settings = field.settings || {};
	const multiple = !! settings.multiple;

	const [ query, setQuery ] = useState( '' );
	const [ open, setOpen ] = useState( false );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );
	const [ resolvedByUrl, setResolvedByUrl ] = useState( {} );
	const containerRef = useRef( null );

	// Whatever shape `value` currently has, reduce it to a plain array of
	// raw entries (a bare URL string, or an already-normalized
	// {value,label,group} chip from a pick made this session) so
	// everything below can treat single/multiple the same way.
	const rawEntries = multiple
		? Array.isArray( value )
			? value
			: []
		: value
		? [ value ]
		: [];
	const rawEntriesKey = JSON.stringify( rawEntries );

	// Resolve any bare-URL entry not already cached -- mirrors
	// PostObjectPicker.jsx's own bare-id-needs-a-follow-up-fetch effect,
	// just keyed by URL instead of id.
	useEffect( () => {
		const urlsNeedingResolve = rawEntries
			.filter( ( entry ) => 'object' !== typeof entry || null === entry )
			.map( ( entry ) => String( entry ) )
			.filter( ( url ) => url && ! resolvedByUrl[ url ] );

		if ( 0 === urlsNeedingResolve.length ) {
			return;
		}

		let cancelled = false;

		Promise.all(
			urlsNeedingResolve.map( ( url ) =>
				resolvePageLink( url ).catch( () => ( {
					value: url,
					label: url,
					group: null,
				} ) )
			)
		).then( ( fetched ) => {
			if ( cancelled ) {
				return;
			}

			setResolvedByUrl( ( previous ) => {
				const next = { ...previous };
				fetched.forEach( ( option ) => {
					next[ option.value ] = option;
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
			return entry;
		}

		const url = String( entry );
		return resolvedByUrl[ url ] || { value: url, label: url, group: null };
	} );

	const showSearch = multiple || 0 === selected.length;
	const excludeUrls = selected.map( ( item ) => item.value );
	const settingsKey = JSON.stringify( settings );

	useEffect( () => {
		if ( ! open || ! showSearch ) {
			return;
		}

		let cancelled = false;
		setLoading( true );

		const handle = setTimeout( () => {
			searchPageLinks( settings, query, excludeUrls )
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
	}, [ query, open, showSearch, settingsKey, excludeUrls.join( ',' ) ] );

	// Close the results dropdown on an outside click, same as
	// RelateAutocomplete.jsx/PostObjectPicker.jsx's own identical effect.
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

	// Groups results by their own `group` (server-assigned -- "Archives"
	// first when present, then one per matching post type's own label),
	// preserving first-seen group order and each group's own item order
	// -- copying the screenshot's own "Archives" heading, then "Post"
	// heading, layout. Re-grouped here rather than trusted to already
	// arrive contiguous: a multi-post-type search sorts every result by
	// title GLOBALLY on the server, which can interleave different
	// groups' own items before this runs.
	const groupedResults = [];
	results.forEach( ( option ) => {
		const groupLabel = option.group || '';
		let group = groupedResults.find( ( g ) => g.group === groupLabel );

		if ( ! group ) {
			group = { group: groupLabel, items: [] };
			groupedResults.push( group );
		}

		group.items.push( option );
	} );

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

	const handleRemove = ( url ) => {
		onChange(
			multiple ? selected.filter( ( item ) => item.value !== url ) : null
		);
	};

	return (
		<div className="gateway-page-link-picker" ref={ containerRef }>
			{ selected.length > 0 && (
				<ul className="gateway-page-link-picker-chips">
					{ selected.map( ( item ) => (
						<li
							key={ item.value }
							className="gateway-page-link-picker-chip"
						>
							{ item.label }
							<button
								type="button"
								className="gateway-page-link-picker-remove"
								onClick={ () => handleRemove( item.value ) }
								aria-label={ `Remove ${ item.label }` }
							>
								×
							</button>
						</li>
					) ) }
				</ul>
			) }

			{ showSearch && (
				<div className="gateway-page-link-picker-search">
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
						<ul className="gateway-page-link-picker-results">
							{ loading && (
								<li className="gateway-page-link-picker-empty">
									Searching…
								</li>
							) }
							{ ! loading && 0 === groupedResults.length && (
								<li className="gateway-page-link-picker-empty">
									No matches.
								</li>
							) }
							{ ! loading &&
								groupedResults.map( ( group ) => (
									<li key={ group.group || '(none)' }>
										{ group.group && (
											<div className="gateway-page-link-picker-group-heading">
												{ group.group }
											</div>
										) }
										<ul>
											{ group.items.map( ( option ) => (
												<li key={ option.value }>
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
									</li>
								) ) }
						</ul>
					) }
				</div>
			) }
		</div>
	);
}
