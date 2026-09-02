import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { searchLinkableContent } from '../api.js';
import Modal from './Modal.jsx';

/**
 * ACF's own Link field, copied per a direct request: "copy ACF link
 * field type, it has URL/Link Text and Open link in new tab in the UI.
 * UI also has list of pages and posts from the site under the manual
 * entry and if the user clicks these the URL is put in automatically."
 * `RecordForm`'s own record editor for `input_type === 'link'`.
 *
 * `value` is `null` (no link) or `{url, title, target}` -- exactly
 * `Link_Field_Type::cast()`'s own shape, target `'_blank'` (open in a
 * new tab) or `''`. Nothing set: a plain "Select Link" button (matching
 * ImagePicker's own "Select Image" wording exactly). Something set: a
 * bordered summary row -- the link's own Title (if any), its URL as a
 * real, clickable `<a target="_blank">` (a quick way to actually visit
 * it, not a form control), a pencil to reopen the modal pre-filled, an
 * "×" to clear it outright.
 *
 * The modal itself (`Modal.jsx`, the same one Add/Edit Record's own
 * outer form already renders inside of -- nesting one further modal on
 * top just stacks correctly in DOM order, no z-index of its own needed)
 * copies WordPress's own classic "Insert/edit link" popup layout
 * pixel-for-pixel: a manual URL/Link Text/"Open link in a new tab"
 * checkbox section, then "Or link to existing content" -- a live search
 * (`searchLinkableContent()`, `api.js`) over this site's own Pages AND
 * Posts together, distinguished the exact same way WordPress's own
 * popup does (a "PAGE" label for a Page, that item's own publish date
 * for a Post, since a Post has no single fixed "type" word worth
 * showing the way a Page's hierarchy-flavored one does) -- clicking a
 * result fills BOTH the URL and Link Text fields from that item, the
 * same "the URL is put in automatically" request literally asks for,
 * plus its title alongside it, matching WordPress's own popup doing
 * the same for both at once.
 *
 * Deliberately a local DRAFT (`draftUrl`/`draftTitle`/`draftTarget`),
 * not a value live-bound straight to `onChange` the way every other
 * RecordForm control is -- this modal has real Cancel/Add Link buttons
 * (again, copying the WordPress popup exactly), so typing into URL/Link
 * Text/searching must NOT touch the record's own live value until "Add
 * Link" is actually clicked; Cancel (or the modal's own × / Escape /
 * overlay click, all routed through the same `onClose`) discards the
 * draft outright, leaving the field's real value exactly as it was.
 *
 * `onKeyDown` on the modal's own content blocks a plain Enter keypress
 * from bubbling -- this whole picker (Modal included, since Modal
 * doesn't portal out) is still nested inside `RecordForm`'s own outer
 * `<form>`, and an unblocked Enter inside a text `<input>` would
 * otherwise submit -- and so save -- the entire record out from under
 * someone still composing a link.
 */
export default function LinkPicker( { value, onChange } ) {
	const [ open, setOpen ] = useState( false );
	const [ draftUrl, setDraftUrl ] = useState( '' );
	const [ draftTitle, setDraftTitle ] = useState( '' );
	const [ draftTarget, setDraftTarget ] = useState( '' );
	const [ search, setSearch ] = useState( '' );
	const [ results, setResults ] = useState( [] );
	const [ loading, setLoading ] = useState( false );

	const openModal = () => {
		setDraftUrl( value?.url || '' );
		setDraftTitle( value?.title || '' );
		setDraftTarget( value?.target || '' );
		setSearch( '' );
		setOpen( true );
	};

	useEffect( () => {
		if ( ! open ) {
			return;
		}

		let cancelled = false;
		setLoading( true );

		const handle = setTimeout( () => {
			searchLinkableContent( search )
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
	}, [ search, open ] );

	const handlePickResult = ( item ) => {
		setDraftUrl( item.link );
		setDraftTitle( item.title );
	};

	const handleAddLink = () => {
		const url = draftUrl.trim();

		onChange(
			url
				? { url, title: draftTitle.trim(), target: draftTarget }
				: null
		);
		setOpen( false );
	};

	const formatResultMeta = ( item ) =>
		'page' === item.type
			? 'PAGE'
			: new Date( item.date ).toLocaleDateString( undefined, {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
			  } );

	return (
		<div className="gateway-link-picker">
			{ value && value.url ? (
				<div className="gateway-link-picker-value">
					{ value.title && (
						<span className="gateway-link-picker-title">
							{ value.title }
						</span>
					) }
					<a href={ value.url } target="_blank" rel="noreferrer">
						{ value.url }
					</a>
					<button
						type="button"
						className="gateway-link-picker-edit"
						onClick={ openModal }
						aria-label="Edit link"
					>
						<Pencil size={ 14 } aria-hidden="true" />
					</button>
					<button
						type="button"
						className="gateway-link-picker-remove"
						onClick={ () => onChange( null ) }
						aria-label="Remove link"
					>
						<X size={ 14 } aria-hidden="true" />
					</button>
				</div>
			) : (
				<button type="button" className="button" onClick={ openModal }>
					Select Link
				</button>
			) }

			{ open && (
				<Modal title="Insert/edit link" onClose={ () => setOpen( false ) }>
					<div
						className="gateway-link-modal"
						onKeyDown={ ( event ) => {
							if ( 'Enter' === event.key ) {
								event.preventDefault();
							}
						} }
					>
						<p className="description">
							Enter the destination URL
						</p>
						<label>
							<span>URL</span>
							<input
								type="text"
								className="regular-text"
								value={ draftUrl }
								onChange={ ( event ) =>
									setDraftUrl( event.target.value )
								}
							/>
						</label>
						<label>
							<span>Link Text</span>
							<input
								type="text"
								className="regular-text"
								value={ draftTitle }
								onChange={ ( event ) =>
									setDraftTitle( event.target.value )
								}
							/>
						</label>
						<label className="gateway-link-modal-checkbox">
							<input
								type="checkbox"
								checked={ '_blank' === draftTarget }
								onChange={ ( event ) =>
									setDraftTarget(
										event.target.checked ? '_blank' : ''
									)
								}
							/>
							Open link in a new tab
						</label>

						<hr />

						<p className="description">
							Or link to existing content
						</p>
						<label>
							<span>Search</span>
							<input
								type="text"
								className="regular-text"
								value={ search }
								onChange={ ( event ) =>
									setSearch( event.target.value )
								}
							/>
						</label>

						<div className="gateway-link-modal-results">
							{ ! search.trim() && (
								<p className="gateway-link-modal-hint">
									No search term specified. Showing recent
									items.
								</p>
							) }
							{ loading ? (
								<p className="gateway-link-modal-empty">
									Searching…
								</p>
							) : 0 === results.length ? (
								<p className="gateway-link-modal-empty">
									No matches.
								</p>
							) : (
								<ul>
									{ results.map( ( item ) => (
										<li key={ `${ item.type }-${ item.id }` }>
											<button
												type="button"
												onClick={ () =>
													handlePickResult( item )
												}
											>
												<span>{ item.title }</span>
												<span className="gateway-link-modal-result-meta">
													{ formatResultMeta( item ) }
												</span>
											</button>
										</li>
									) ) }
								</ul>
							) }
						</div>

						<div className="gateway-link-modal-footer">
							<button
								type="button"
								className="button"
								onClick={ () => setOpen( false ) }
							>
								Cancel
							</button>
							<button
								type="button"
								className="button button-primary"
								onClick={ handleAddLink }
							>
								Add Link
							</button>
						</div>
					</div>
				</Modal>
			) }
		</div>
	);
}
