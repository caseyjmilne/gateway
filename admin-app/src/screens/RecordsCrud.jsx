import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import RecordForm from '../components/RecordForm.jsx';
import Modal from '../components/Modal.jsx';

const PER_PAGE = 20;

/**
 * The actual CRUD UI for one model's records: a table of existing rows,
 * plus an "Add New" form and an Edit form of its own for whichever
 * row's own Edit button was clicked, BOTH opened in a `Modal`
 * (`admin-app/src/components/Modal.jsx`) floating above the list rather
 * than growing inline as an extra `<tr>` under the row (FieldEditor's
 * own Fields table still does the latter, and that's the right call
 * there -- a field has only a handful of settings, so its own panel
 * never grows large enough to be a problem; a MODEL's records can carry
 * many more fields than that, and an inline form that size pushed every
 * row below the one being edited further down the page as it grew,
 * which is what the modal fixes: the list stays exactly where it is
 * underneath, whatever the form's own length). Add New used to stay
 * inline instead -- already anchored at a fixed position above the
 * table that never moved as the form grew, so it never had Edit's own
 * growing-table problem to begin with -- but the two are now
 * deliberately symmetric (same Modal, same "Add New "/"Edit " + model
 * name title convention) rather than one action opening a floating
 * dialog and the other growing the page, purely for a consistent feel
 * between the two most common actions on this screen. Every column and
 * every form input is driven entirely by the model's own fields
 * (Gateway\Model_Fields, fetched as part of the model detail response) --
 * there's no separate "which columns to show" configuration here at all.
 *
 * Delete opens its own small confirmation `Modal` too, rather than
 * deleting the instant the row's own Delete button is clicked -- a
 * genuinely destructive, unrecoverable action deserves a second click
 * (matching wp-admin's own convention for e.g. trashing a post), unlike
 * Edit's modal, which just holds a form nothing has committed yet.
 * `deleteConfirmId` (which record is being asked about) and `deletingId`
 * (whether that record's own DELETE request is actually in flight) are
 * deliberately two different pieces of state, the same "asking" vs.
 * "doing" split every other action here already has between its own
 * `showAddForm`/`addSubmitting` or `editingId`/`editSubmitting` pair -- a
 * failed delete leaves the confirmation modal open with the error shown
 * inside it (same as Edit's own `editError`) rather than silently
 * closing as if it had succeeded.
 *
 * A field whose type is_sensitive() (Password_Field_Type, currently the
 * only one) has its value masked in this table -- the record's own
 * response still carries the real value (there's no reason to hide it
 * from an admin who's allowed to edit it at all), only its *display*
 * here is masked, the same way a plain <input type="password"> masks
 * typing without hiding the value from the person typing it.
 */
export default function RecordsCrud() {
	const { className } = useParams();
	const fieldTypes = useFieldTypes();

	const [ model, setModel ] = useState( null );
	const [ modelError, setModelError ] = useState( '' );

	const [ records, setRecords ] = useState( [] );
	const [ total, setTotal ] = useState( 0 );
	const [ page, setPage ] = useState( 1 );
	const [ loadingRecords, setLoadingRecords ] = useState( true );
	const [ recordsError, setRecordsError ] = useState( '' );

	const [ showAddForm, setShowAddForm ] = useState( false );
	const [ addSubmitting, setAddSubmitting ] = useState( false );
	const [ addError, setAddError ] = useState( '' );

	const [ editingId, setEditingId ] = useState( null );
	const [ editSubmitting, setEditSubmitting ] = useState( false );
	const [ editError, setEditError ] = useState( '' );

	const [ deletingId, setDeletingId ] = useState( null );
	const [ deleteError, setDeleteError ] = useState( '' );
	// The record a Delete click is asking to confirm -- distinct from
	// `deletingId` below, which only tracks the DELETE request actually
	// in flight (after that confirmation), the same "asking" vs. "doing"
	// split `editingId`/`editSubmitting` already have.
	const [ deleteConfirmId, setDeleteConfirmId ] = useState( null );

	const basePath = `/models/${ encodeURIComponent( className ) }/records`;

	useEffect( () => {
		let cancelled = false;

		setModel( null );
		setModelError( '' );
		setShowAddForm( false );
		setEditingId( null );

		apiFetch( `/models/${ encodeURIComponent( className ) }` )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setModel( data );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setModelError( err.message );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ className ] );

	const loadRecords = useCallback(
		async ( targetPage ) => {
			setLoadingRecords( true );
			setRecordsError( '' );

			try {
				const data = await apiFetch(
					`${ basePath }?page=${ targetPage }&per_page=${ PER_PAGE }`
				);
				setRecords( data.records );
				setTotal( data.total );
				setPage( data.page );
			} catch ( err ) {
				setRecordsError( err.message );
			} finally {
				setLoadingRecords( false );
			}
		},
		[ basePath ]
	);

	useEffect( () => {
		loadRecords( 1 );
	}, [ loadRecords ] );

	const handleAdd = async ( values ) => {
		setAddSubmitting( true );
		setAddError( '' );

		try {
			await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( values ),
			} );
			setShowAddForm( false );
			loadRecords( 1 ); // a new record sorts first (newest-first order)
		} catch ( err ) {
			setAddError( err.message );
		} finally {
			setAddSubmitting( false );
		}
	};

	const handleEditSave = async ( id, values ) => {
		setEditSubmitting( true );
		setEditError( '' );

		try {
			await apiFetch( `${ basePath }/${ id }`, {
				method: 'PUT',
				body: JSON.stringify( values ),
			} );
			setEditingId( null );
			loadRecords( page );
		} catch ( err ) {
			setEditError( err.message );
		} finally {
			setEditSubmitting( false );
		}
	};

	const handleDelete = async ( id ) => {
		setDeleteError( '' );
		setDeletingId( id );

		try {
			await apiFetch( `${ basePath }/${ id }`, { method: 'DELETE' } );
			// Only closes the confirm modal on SUCCESS -- an error leaves
			// it open with `deleteError` shown inside it, the same "stay
			// open and show what went wrong" behavior the Edit modal's
			// own `editError` already has, rather than silently
			// dismissing a failed delete as if it had gone through.
			setDeleteConfirmId( null );
			loadRecords( page );
		} catch ( err ) {
			setDeleteError( err.message );
		} finally {
			setDeletingId( null );
		}
	};

	const fields = model ? model.fields : [];
	const totalPages = Math.max( 1, Math.ceil( total / PER_PAGE ) );
	// `null` both while nothing is being edited and for the brief window
	// right after a delete/reload where the previously-edited record's id
	// no longer matches anything in the freshly-fetched `records` -- the
	// Modal below only ever renders when this is non-null, so either case
	// just means no modal shows.
	const editingRecord =
		records.find( ( record ) => record.id === editingId ) || null;

	// Same "null means no modal" shape as `editingRecord` above, and the
	// same reasoning: looking the record back up by id (rather than just
	// checking `null !== deleteConfirmId`) means a reload racing the
	// confirm click harmlessly closes this modal instead of confirming
	// against a record that's no longer in `records` at all.
	const deleteConfirmRecord =
		records.find( ( record ) => record.id === deleteConfirmId ) || null;

	const isSensitive = ( type ) =>
		fieldTypes.find( ( fieldType ) => fieldType.key === type )
			?.is_sensitive ?? false;

	const inputTypeFor = ( type ) =>
		fieldTypes.find( ( fieldType ) => fieldType.key === type )?.input_type;

	// A relate field's value arrives already enriched (Records_REST_Controller::
	// enrich_records()) into `{id, label}`/`[{id, label}, ...]` rather than a
	// plain scalar -- shown here as just its label(s), not the raw shape.
	const displayValue = ( field, record ) => {
		const inputType = inputTypeFor( field.type );

		if ( 'relate_one' === inputType ) {
			const value = record[ field.name ];
			return value ? value.label : '';
		}

		if ( 'relate_many' === inputType ) {
			const value = record[ field.name ] || [];
			return value.map( ( item ) => item.label ).join( ', ' );
		}

		// An Image field's own value is enriched the same three ways
		// ImagePicker/RecordForm already handle (see their own docblocks):
		// the full `{id, url, alt, width, height, sizes}` object or a bare
		// URL string both have something to actually render a thumbnail
		// from; a bare id (return_format 'id') doesn't, without a per-row
		// fetch this list view has no reason to make just for a thumbnail,
		// so it falls back to naming the id instead of rendering it as a
		// plain, misleadingly numeric-looking value. Whichever shape it
		// is, this must never fall through to the plain `?? ''` branch
		// below -- returning the raw enriched OBJECT there is exactly
		// what used to crash this screen ("Objects are not valid as a
		// React child").
		if ( 'image' === inputType ) {
			const value = record[ field.name ];

			if ( ! value ) {
				return '';
			}

			if ( 'object' === typeof value ) {
				const thumbUrl = value.sizes?.thumbnail?.url || value.url;
				return thumbUrl ? (
					<img
						src={ thumbUrl }
						alt={ value.alt || '' }
						className="gateway-records-crud-thumbnail"
					/>
				) : '';
			}

			if ( 'string' === typeof value ) {
				return (
					<img
						src={ value }
						alt=""
						className="gateway-records-crud-thumbnail"
					/>
				);
			}

			return `Image #${ value }`;
		}

		// A File field's own value is enriched the same three ways
		// FilePicker/RecordForm already handle -- same reasoning as
		// Image's own branch above, just with a filename link instead of
		// a thumbnail (there's nothing to preview visually for an
		// arbitrary file the way there is for an image).
		if ( 'file' === inputType ) {
			const value = record[ field.name ];

			if ( ! value ) {
				return '';
			}

			if ( 'object' === typeof value ) {
				return value.url ? (
					<a href={ value.url } target="_blank" rel="noreferrer">
						{ value.filename || value.title || value.url }
					</a>
				) : '';
			}

			if ( 'string' === typeof value ) {
				return (
					<a href={ value } target="_blank" rel="noreferrer">
						{ value }
					</a>
				);
			}

			return `File #${ value }`;
		}

		// A WYSIWYG field's own stored value is genuine HTML
		// (WYSIWYG_Field_Type::is_text_renderable() is false for exactly
		// this reason) -- showing it here as literal escaped markup
		// ("<p>Hello</p>") would be both ugly and unhelpful, and there's
		// no "render as trusted HTML" story for this list either, so a
		// stripped, truncated plain-text preview is the safe middle
		// ground rather than falling through to the generic branch
		// below.
		if ( 'wysiwyg' === inputType ) {
			const value = record[ field.name ] || '';
			const stripped = value
				.replace( /<[^>]*>/g, ' ' )
				.replace( /\s+/g, ' ' )
				.trim();
			return stripped.length > 140
				? `${ stripped.slice( 0, 140 ) }…`
				: stripped;
		}

		// An oEmbed field's own stored value is just a URL (unlike
		// Image/File, there's no enriched object/id/url three-way shape
		// to branch on -- see OEmbed_Field_Type's own docblock) -- the
		// generic branch below would already render it safely as plain
		// text, this just makes it clickable, the same small polish
		// File's own filename link already has.
		if ( 'oembed' === inputType ) {
			const value = record[ field.name ];
			return value ? (
				<a href={ value } target="_blank" rel="noreferrer">
					{ value }
				</a>
			) : '';
		}

		const value = record[ field.name ] ?? '';
		return isSensitive( field.type ) && '' !== value ? '••••••••' : value;
	};

	return (
		<div className="gateway-records-crud">
			<p>
				<Link to="/records">&larr; Back to Records</Link>
			</p>

			{ modelError && (
				<div className="notice notice-error">
					<p>{ modelError }</p>
				</div>
			) }

			{ model && (
				<>
					<h2>
						<code>{ model.class }</code> Records
					</h2>

					{ fields.length === 0 ? (
						<p className="description">
							This model has no fields yet -- add some on its{ ' ' }
							<Link to={ `/models/${ model.class }` }>
								Models
							</Link>{ ' ' }
							screen first.
						</p>
					) : (
						<>
							<p>
								<button
									type="button"
									className="button button-primary"
									onClick={ () => setShowAddForm( true ) }
								>
									Add New
								</button>
							</p>

							{ recordsError && (
								<div className="notice notice-error">
									<p>{ recordsError }</p>
								</div>
							) }
							{ deleteError && (
								<div className="notice notice-error">
									<p>{ deleteError }</p>
								</div>
							) }

							{ loadingRecords ? (
								<p>Loading…</p>
							) : records.length === 0 ? (
								<p className="description">No records yet.</p>
							) : (
								<table className="widefat striped">
									<thead>
										<tr>
											<th>ID</th>
											{ fields.map( ( field ) => (
												<th key={ field.name }>
													{ field.label || field.name }
												</th>
											) ) }
											<th></th>
										</tr>
									</thead>
									<tbody>
										{ records.map( ( record ) => (
											<tr key={ record.id }>
												<td>{ record.id }</td>
												{ fields.map( ( field ) => (
													<td key={ field.name }>
														{ displayValue(
															field,
															record
														) }
													</td>
												) ) }
												<td>
													<button
														type="button"
														className="button"
														onClick={ () =>
															setEditingId(
																record.id
															)
														}
													>
														Edit
													</button>
													<button
														type="button"
														className="button"
														onClick={ () => {
															setDeleteError( '' );
															setDeleteConfirmId(
																record.id
															);
														} }
														disabled={
															deletingId ===
															record.id
														}
													>
														{ deletingId ===
														record.id
															? 'Deleting…'
															: 'Delete' }
													</button>
												</td>
											</tr>
										) ) }
									</tbody>
								</table>
							) }

							{ totalPages > 1 && (
								<p>
									<button
										type="button"
										className="button"
										onClick={ () =>
											loadRecords( page - 1 )
										}
										disabled={ page <= 1 }
									>
										Previous
									</button>{ ' ' }
									Page { page } of { totalPages }{ ' ' }
									<button
										type="button"
										className="button"
										onClick={ () =>
											loadRecords( page + 1 )
										}
										disabled={ page >= totalPages }
									>
										Next
									</button>
								</p>
							) }
						</>
					) }
				</>
			) }

			{ showAddForm && (
				<Modal
					title={ `Add New ${ model.class }` }
					onClose={ () => setShowAddForm( false ) }
				>
					<div className="gateway-record-form-wrap">
						<RecordForm
							fields={ fields }
							fieldTypes={ fieldTypes }
							onSubmit={ handleAdd }
							onCancel={ () => setShowAddForm( false ) }
							submitLabel="Add Record"
							submitting={ addSubmitting }
						/>
						{ addError && (
							<div className="notice notice-error">
								<p>{ addError }</p>
							</div>
						) }
					</div>
				</Modal>
			) }

			{ editingRecord && (
				<Modal
					title={ `Edit ${ model.class } #${ editingRecord.id }` }
					onClose={ () => setEditingId( null ) }
				>
					<div className="gateway-record-form-wrap">
						<RecordForm
							fields={ fields }
							fieldTypes={ fieldTypes }
							initialValues={ editingRecord }
							onSubmit={ ( values ) =>
								handleEditSave( editingRecord.id, values )
							}
							onCancel={ () => setEditingId( null ) }
							submitLabel="Save"
							submitting={ editSubmitting }
						/>
						{ editError && (
							<div className="notice notice-error">
								<p>{ editError }</p>
							</div>
						) }
					</div>
				</Modal>
			) }

			{ deleteConfirmRecord && (
				<Modal
					title="Delete Record"
					onClose={ () => setDeleteConfirmId( null ) }
				>
					<p>
						Are you sure you want to delete{ ' ' }
						<code>
							{ model.class } #{ deleteConfirmRecord.id }
						</code>
						? This cannot be undone.
					</p>
					{ deleteError && (
						<div className="notice notice-error">
							<p>{ deleteError }</p>
						</div>
					) }
					<p>
						<button
							type="button"
							className="button button-primary"
							onClick={ () =>
								handleDelete( deleteConfirmRecord.id )
							}
							disabled={
								deletingId === deleteConfirmRecord.id
							}
						>
							{ deletingId === deleteConfirmRecord.id
								? 'Deleting…'
								: 'Delete' }
						</button>{ ' ' }
						<button
							type="button"
							className="button"
							onClick={ () => setDeleteConfirmId( null ) }
							disabled={
								deletingId === deleteConfirmRecord.id
							}
						>
							Cancel
						</button>
					</p>
				</Modal>
			) }
		</div>
	);
}
