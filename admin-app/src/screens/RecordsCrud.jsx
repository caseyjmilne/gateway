import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { arrayMove } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useReorderSensors from '../hooks/useReorderSensors.js';
import useSortableRow from '../hooks/useSortableRow.js';
import RecordForm from '../components/RecordForm.jsx';
import Modal from '../components/Modal.jsx';
import DndSortableGroup from '../components/DndSortableGroup.jsx';
import { getRecordPermalink } from '../utils/permalink.js';

const PER_PAGE = 20;

/**
 * The page size used INSTEAD of PER_PAGE for a model that has a Position
 * field (`Position_Field_Type`) -- matches Records_REST_Controller::
 * MAX_PER_PAGE exactly, the server's own hard cap. Drag-and-drop
 * reordering only makes sense against the model's ENTIRE current
 * ordering, not one arbitrary 20-row slice of it (dragging a row from
 * page 1 to page 2 has no sensible meaning) -- so a Position-enabled
 * model always requests this larger page instead, and `canReorder` below
 * only ever turns on once every one of the model's own records genuinely
 * fits on that one page (`total <= records.length`). A model with more
 * records than this is a known, accepted trade-off (same "real
 * pagination/lazy-loading is separate work" shape this plugin's own
 * Data Display block docblock already accepts elsewhere): reordering
 * simply isn't offered, and the table falls back to its normal paginated
 * view instead of ever silently dragging against an incomplete list.
 */
const POSITION_PER_PAGE = 100;

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
 * between the two most common actions on this screen. Every FORM input
 * is driven entirely by the model's own fields (Gateway\Model_Fields,
 * fetched as part of the model detail response) -- Add/Edit always
 * offer every field, regardless of the table's own column configuration
 * below. Which of those fields actually show as TABLE columns, their
 * order, and which are clickable to sort by, is a separate, optional
 * per-model configuration (Gateway\Model_Columns -- the Columns tab on
 * ModelDetail, alongside Permalinks): unconfigured, every field still
 * shows exactly as it always has (see `displayedFields` below); this is
 * what a site owner reaches for once a model's own field count makes
 * this table cluttered.
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

	// This model's own Position field (Position_Field_Type), auto-detected
	// the same way `getRecordPermalink()` already auto-detects a Permalink
	// field -- `null` for every model that doesn't have one, which is what
	// keeps every bit of drag-and-drop reordering below a no-op for those.
	const positionField =
		( model ? model.fields : [] ).find(
			( field ) => 'position' === field.type
		) || null;

	const [ records, setRecords ] = useState( [] );
	const [ total, setTotal ] = useState( 0 );
	const [ page, setPage ] = useState( 1 );
	const [ loadingRecords, setLoadingRecords ] = useState( true );
	const [ recordsError, setRecordsError ] = useState( '' );

	// Which column the table is currently sorted by -- 'id'/'desc' is
	// this endpoint's own long-standing default (see Records_REST_
	// Controller::list_records()'s own resolve_sort()), kept in sync
	// with whatever the SERVER actually applied (loadRecords() below
	// corrects these back from the response) rather than trusted
	// blindly: a column that stops being sortable (its own Columns
	// config changed elsewhere) must never leave this stuck showing an
	// indicator for a sort that no longer took effect.
	const [ orderBy, setOrderBy ] = useState( 'id' );
	const [ order, setOrder ] = useState( 'desc' );

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
		async ( targetPage, targetOrderBy, targetOrder ) => {
			setLoadingRecords( true );
			setRecordsError( '' );

			try {
				const params = new URLSearchParams( {
					page: targetPage,
					// A Position-enabled model always requests the larger
					// page -- see POSITION_PER_PAGE's own docblock for why
					// drag-and-drop reordering needs the model's entire
					// current ordering in hand, not one arbitrary slice of
					// it, regardless of which column it happens to be
					// sorted by at the moment.
					per_page: positionField ? POSITION_PER_PAGE : PER_PAGE,
					orderby: targetOrderBy,
					order: targetOrder,
				} );
				const data = await apiFetch( `${ basePath }?${ params.toString() }` );
				setRecords( data.records );
				setTotal( data.total );
				setPage( data.page );
				// Reads the sort the server ACTUALLY applied back into state
				// -- resolve_sort() silently falls back to id/desc for
				// anything invalid or no longer sortable, so this keeps the
				// column-header indicator honest about what's really
				// showing rather than whatever was merely requested.
				setOrderBy( data.orderby );
				setOrder( data.order );
			} catch ( err ) {
				setRecordsError( err.message );
			} finally {
				setLoadingRecords( false );
			}
		},
		[ basePath, positionField ]
	);

	useEffect( () => {
		// Waits for the model itself to resolve (rather than firing
		// alongside that fetch the way this effect used to) purely so the
		// very FIRST records fetch already knows whether to default to
		// Position order -- a model with a Position field sorts by it
		// (ascending) right from the start, the same unconditional
		// treatment `id` already gets for every other model, rather than
		// loading id/desc first and only re-sorting a moment later once
		// the model's own fields arrive.
		if ( ! model ) {
			return;
		}

		if ( positionField ) {
			loadRecords( 1, positionField.name, 'asc' );
		} else {
			loadRecords( 1, 'id', 'desc' );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only
		// re-fetches on a genuine model switch (model/positionField, both
		// derived from the same model fetch) or a deliberate handleSort()/
		// drag reorder (which pass their own explicit orderBy/order
		// straight through, not via this effect) -- orderBy/order
		// themselves are deliberately left out of this dependency list so
		// loadRecords() correcting them back from the server's own
		// response (just above) never triggers a second, redundant fetch.
	}, [ model, positionField, loadRecords ] );

	const handleSort = ( key ) => {
		const nextOrder = key === orderBy && 'asc' === order ? 'desc' : 'asc';
		loadRecords( 1, key, nextOrder );
	};

	const handleAdd = async ( values ) => {
		setAddSubmitting( true );
		setAddError( '' );

		try {
			await apiFetch( basePath, {
				method: 'POST',
				body: JSON.stringify( values ),
			} );
			setShowAddForm( false );
			// Preserves whatever sort is currently showing (id/desc puts a
			// new record first, but a site owner already sorted by, say,
			// Title has no reason to have that silently reset just because
			// a record was added).
			loadRecords( 1, orderBy, order );
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
			loadRecords( page, orderBy, order );
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
			loadRecords( page, orderBy, order );
		} catch ( err ) {
			setDeleteError( err.message );
		} finally {
			setDeletingId( null );
		}
	};

	const [ reorderError, setReorderError ] = useState( '' );

	const dragSensors = useReorderSensors();

	/**
	 * Persists a completed drag -- optimistically reorders `records` in
	 * state immediately (so the row's own drop feels instant, not stuck
	 * waiting on a round trip), then tells the server the full new order
	 * via `reorder_records()`, which renumbers every one of this model's
	 * own records' Position values to match. A failed request rolls the
	 * optimistic reorder back by simply re-fetching the real, still
	 * -server-side order rather than trying to reverse the local
	 * reshuffle by hand.
	 */
	const handleDragEnd = ( event ) => {
		const { active, over } = event;

		if ( ! over || active.id === over.id ) {
			return;
		}

		const oldIndex = records.findIndex( ( record ) => record.id === active.id );
		const newIndex = records.findIndex( ( record ) => record.id === over.id );

		if ( -1 === oldIndex || -1 === newIndex ) {
			return;
		}

		const reordered = arrayMove( records, oldIndex, newIndex );
		setRecords( reordered );
		setReorderError( '' );

		apiFetch( `${ basePath }/reorder`, {
			method: 'PUT',
			body: JSON.stringify( { ids: reordered.map( ( record ) => record.id ) } ),
		} ).catch( ( err ) => {
			setReorderError( err.message );
			// The optimistic reorder above no longer matches the server's
			// own (unchanged) Position values -- re-fetching is simpler,
			// and just as correct, as hand-computing the exact inverse of
			// arrayMove() above.
			loadRecords( page, orderBy, order );
		} );
	};

	const fields = model ? model.fields : [];

	// Which of this model's own fields actually show as Records-table
	// columns, and in what order -- Gateway\Model_Columns' own
	// "unconfigured means show everything" default (see that class's own
	// docblock) whenever `model.columns` is null, otherwise exactly the
	// CONFIGURED list, in the Columns tab's own saved order. A stale key
	// (the field was renamed/removed since Columns was last saved) is
	// simply skipped here rather than shown as a broken column -- the
	// same "never trust stored config blindly" discipline Model_Columns::
	// set() already re-applies server-side on its own. `fields` itself
	// (unfiltered) still feeds RecordForm below -- hiding a column from
	// this table must never hide the underlying field from the Add/Edit
	// form.
	const columnsConfig = model ? model.columns : null;
	const displayedFields = columnsConfig
		? columnsConfig
				.map( ( column ) => fields.find( ( field ) => field.name === column.key ) )
				.filter( Boolean )
		: fields;

	// Which columns are actually clickable to sort by -- 'id' (this
	// table's own fixed leading column) is always sortable, matching
	// Records_REST_Controller::list_records()'s own resolve_sort(), which
	// always allows it regardless of Columns configuration -- a Position
	// field's own column gets that same unconditional treatment there,
	// mirrored here.
	const sortableKeys = new Set( [
		'id',
		...( positionField ? [ positionField.name ] : [] ),
		...( columnsConfig || [] )
			.filter( ( column ) => column.sortable )
			.map( ( column ) => column.key ),
	] );

	// Whether every one of this model's own records is genuinely showing
	// right now (drag-and-drop reordering against anything less would
	// silently corrupt the records NOT currently loaded -- see
	// POSITION_PER_PAGE's own docblock), AND the table is actually
	// currently sorted by Position ascending -- sorted any other way, the
	// on-screen row order wouldn't match real Position values at all, so
	// dragging would reorder something other than what's visually being
	// dragged.
	const canReorder =
		Boolean( positionField ) &&
		orderBy === positionField.name &&
		'asc' === order &&
		total <= records.length;

	const totalPages = Math.max(
		1,
		Math.ceil( total / ( positionField ? POSITION_PER_PAGE : PER_PAGE ) )
	);
	// `null` both while nothing is being edited and for the brief window
	// right after a delete/reload where the previously-edited record's id
	// no longer matches anything in the freshly-fetched `records` -- the
	// Modal below only ever renders when this is non-null, so either case
	// just means no modal shows.
	const editingRecord =
		records.find( ( record ) => record.id === editingId ) || null;

	// The classic WordPress "Permalink: ... View" chrome, shown at the
	// top of the Edit modal -- computed here rather than inline in the
	// JSX below purely so it's only ever called once per render for this
	// one record, unlike the table's own per-row `getRecordPermalink()`
	// calls (there's no single "current row" to hoist it out to).
	const editingPermalink = editingRecord
		? getRecordPermalink( fields, editingRecord )
		: null;

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

		// A User field's own value is enriched the same way Post Object's
		// own is (Records_REST_Controller::enrich_user_fields()) -- a
		// bare user id, the enriched {id, name, email, avatar_url}
		// object, or (when `settings.multiple` is on) an ARRAY of either
		// -- see User_Field_Type's own docblock. Rendered as comma
		// -joined names (never a link -- unlike Image/File, there's no
		// obvious "visit this" URL for a person the way there is for an
		// attachment), falling back to a named placeholder for a bare id
		// (return_format 'id') -- resolving that to a real name would
		// need a per-row fetch this list view has no reason to make,
		// same reasoning Image's own bare-id branch above already gives.
		if ( 'user' === inputType ) {
			const raw = record[ field.name ];
			const items = Array.isArray( raw ) ? raw : raw ? [ raw ] : [];

			if ( 0 === items.length ) {
				return '';
			}

			return items
				.map( ( item ) =>
					'object' === typeof item
						? item.name || `User #${ item.id }`
						: `User #${ item }`
				)
				.join( ', ' );
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

		// A Link field's own value is enriched the same two ways
		// LinkPicker/RecordForm already handle (see Link_Field_Type's own
		// docblock): the full `{url, title, target}` object, or a bare URL
		// string (return_format 'url'). Either way this must never fall
		// through to the generic `?? ''` branch below -- returning the raw
		// object there is exactly what crashed this screen ("Minified
		// React error #31: Objects are not valid as a React child"),
		// reported directly, the same class of bug the Image/File
		// branches above already guard against for their own structured
		// values.
		if ( 'link' === inputType ) {
			const value = record[ field.name ];

			if ( ! value ) {
				return '';
			}

			if ( 'object' === typeof value ) {
				return value.url ? (
					<a
						href={ value.url }
						target={ '_blank' === value.target ? '_blank' : undefined }
						rel="noreferrer"
					>
						{ value.title || value.url }
					</a>
				) : '';
			}

			return (
				<a href={ value } target="_blank" rel="noreferrer">
					{ value }
				</a>
			);
		}

		// A Post Object field's own value is enriched the same way Image/
		// File/User's own is (Records_REST_Controller::enrich_post_object_fields()) --
		// a bare post id, the full `{id, title, permalink, post_type,
		// status}` object, or (when `settings.multiple` is on) an ARRAY of
		// either -- see Post_Object_Field_Type's own docblock. Every one of
		// those shapes must be handled explicitly here, same reasoning as
		// every other structured-value branch above: falling through to
		// the generic `?? ''` branch below with an object (or array of
		// them) still in hand is exactly the "Objects are not valid as a
		// React child" crash Link's own branch above already guards
		// against. Rendered as comma-joined title links (falling back to
		// plain, non-linked text when a bare id has no permalink to link
		// to) -- same "clickable when there's a real URL, plain text
		// otherwise" split Link's own branch already makes.
		if ( 'post_object' === inputType ) {
			const raw = record[ field.name ];
			const items = Array.isArray( raw ) ? raw : raw ? [ raw ] : [];

			if ( 0 === items.length ) {
				return '';
			}

			return items.map( ( item, index ) => (
				<span key={ 'object' === typeof item ? item.id : item }>
					{ index > 0 && ', ' }
					{ 'object' === typeof item ? (
						item.permalink ? (
							<a href={ item.permalink } target="_blank" rel="noreferrer">
								{ item.title || `#${ item.id }` }
							</a>
						) : (
							item.title || `#${ item.id }`
						)
					) : (
						`Post #${ item }`
					) }
				</span>
			) );
		}

		// A Page Link field's own value is enriched by
		// Records_REST_Controller::enrich_page_link_fields() -- always
		// just a bare URL string, or (when `settings.multiple` is on) an
		// ARRAY of them -- see Page_Link_Field_Type's own docblock for
		// why this one never has the richer object shape Post Object's
		// own branch above has to handle. Simpler as a result: every
		// entry is already a real, clickable URL, so this always renders
		// a link, never plain text the way Post Object's own bare-id
		// fallback does.
		if ( 'page_link' === inputType ) {
			const raw = record[ field.name ];
			const urls = Array.isArray( raw ) ? raw : raw ? [ raw ] : [];

			if ( 0 === urls.length ) {
				return '';
			}

			return urls.map( ( url, index ) => (
				<span key={ url }>
					{ index > 0 && ', ' }
					<a href={ url } target="_blank" rel="noreferrer">
						{ url }
					</a>
				</span>
			) );
		}

		// select/radio/buttons/checkboxes -- the record's own stored value
		// (or, for checkboxes, values) is always a raw `choice.value`
		// (Choice_Field_Type::cast() never sees `label` at all -- see
		// Gateway\\Model_Field_Choices' own docblock), which is often not
		// what a site owner actually wants to SEE in this list -- a
		// technical value like "in_progress" where the configured label
		// reads "In Progress". Resolved back to its matching choice's own
		// label here, purely for this display; a value that no longer
		// matches any of the field's own CURRENT choices (one since
		// renamed or removed from the list, but never retroactively
		// scrubbed from already-saved records -- see Checkbox_Field_Type::
		// cast()'s own docblock for why) falls back to showing the raw
		// value as-is rather than silently disappearing.
		if ( 'select' === inputType || 'radio' === inputType || 'buttons' === inputType ) {
			const value = record[ field.name ];
			const choice = ( field.choices || [] ).find( ( c ) => c.value === value );
			return value ? ( choice ? choice.label : value ) : '';
		}

		if ( 'checkboxes' === inputType ) {
			const values = record[ field.name ] || [];
			return values
				.map( ( value ) => {
					const choice = ( field.choices || [] ).find( ( c ) => c.value === value );
					return choice ? choice.label : value;
				} )
				.join( ', ' );
		}

		const value = record[ field.name ] ?? '';
		return isSensitive( field.type ) && '' !== value ? '••••••••' : value;
	};

	/**
	 * One record's own `<td>`s (id, every displayed field, then the View/
	 * Edit/Delete actions) -- shared between the plain `<tr>` this table
	 * renders normally and `SortableRecordRow`'s own `<tr>` while
	 * `canReorder` is on, so the two never risk drifting out of sync with
	 * each other (a mismatched cell count between them would misalign the
	 * `<thead>`'s own columns the moment reordering toggles on/off).
	 */
	const renderRecordCells = ( record ) => {
		const recordPermalink = getRecordPermalink( fields, record );

		return (
			<>
				<td>{ record.id }</td>
				{ displayedFields.map( ( field ) => (
					<td key={ field.name }>
						{ displayValue( field, record ) }
					</td>
				) ) }
				<td>
					{ recordPermalink && (
						<a
							href={ recordPermalink }
							target="_blank"
							rel="noreferrer"
							className="button"
						>
							View
						</a>
					) }
					<button
						type="button"
						className="button"
						onClick={ () => setEditingId( record.id ) }
					>
						Edit
					</button>
					<button
						type="button"
						className="button"
						onClick={ () => {
							setDeleteError( '' );
							setDeleteConfirmId( record.id );
						} }
						disabled={ deletingId === record.id }
					>
						{ deletingId === record.id ? 'Deleting…' : 'Delete' }
					</button>
				</td>
			</>
		);
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

							{ positionField && (
								<p className="description">
									{ canReorder
										? 'Drag a row by its handle to reorder. Sorting saves automatically.'
										: 'This model has a Position field -- ' +
										  `sort by "${
												positionField.label ||
												positionField.name
										  }" to drag-and-drop reorder it.` }
								</p>
							) }

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
							{ reorderError && (
								<div className="notice notice-error">
									<p>{ reorderError }</p>
								</div>
							) }

							{ loadingRecords ? (
								<p>Loading…</p>
							) : records.length === 0 ? (
								<p className="description">No records yet.</p>
							) : (
								<DndSortableGroup
									enabled={ canReorder }
									sensors={ dragSensors }
									onDragEnd={ handleDragEnd }
									itemIds={ records.map( ( record ) => record.id ) }
								>
									<table className="widefat striped">
										<thead>
											<tr>
												{ canReorder && (
													<th className="gateway-records-crud-drag-handle-column"></th>
												) }
												<th>
													<SortableHeader
														label="ID"
														columnKey="id"
														orderBy={ orderBy }
														order={ order }
														onSort={ handleSort }
													/>
												</th>
												{ displayedFields.map( ( field ) => (
													<th key={ field.name }>
														{ sortableKeys.has( field.name ) ? (
															<SortableHeader
																label={ field.label || field.name }
																columnKey={ field.name }
																orderBy={ orderBy }
																order={ order }
																onSort={ handleSort }
															/>
														) : (
															field.label || field.name
														) }
													</th>
												) ) }
												<th></th>
											</tr>
										</thead>
										<tbody>
											{ records.map( ( record ) =>
												canReorder ? (
													<SortableRecordRow
														key={ record.id }
														record={ record }
													>
														{ renderRecordCells( record ) }
													</SortableRecordRow>
												) : (
													<tr key={ record.id }>
														{ renderRecordCells( record ) }
													</tr>
												)
											) }
										</tbody>
									</table>
								</DndSortableGroup>
							) }

							{ totalPages > 1 && (
								<p>
									<button
										type="button"
										className="button"
										onClick={ () =>
											loadRecords( page - 1, orderBy, order )
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
											loadRecords( page + 1, orderBy, order )
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
					{ editingPermalink && (
						<p className="gateway-record-permalink">
							Permalink:{ ' ' }
							<a
								href={ editingPermalink }
								target="_blank"
								rel="noreferrer"
							>
								{ editingPermalink }
							</a>
						</p>
					) }
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

/**
 * One clickable column-header button, for a column `sortableKeys` (in
 * the component above) actually allows sorting by. A plain inline
 * `▲`/`▼` next to the label -- not a separate icon library -- shows
 * only on the currently-active column, matching whichever `order` the
 * table is actually sorted by right now (per `orderBy`/`order` reflecting
 * the SERVER's own applied sort, not just whatever was last clicked --
 * see `loadRecords()`'s own docblock).
 */
function SortableHeader( { label, columnKey, orderBy, order, onSort } ) {
	const isActive = columnKey === orderBy;

	return (
		<button
			type="button"
			className="gateway-records-crud-sort"
			onClick={ () => onSort( columnKey ) }
		>
			{ label }
			{ isActive && ( 'asc' === order ? ' ▲' : ' ▼' ) }
		</button>
	);
}

/**
 * One draggable table row, used ONLY while `canReorder` is true (the
 * caller never mounts this otherwise -- a plain `<tr>` handles every
 * other case). `useSortableRow()` (shared with FieldEditor's own Fields
 * list) does the actual `@dnd-kit/sortable` wiring -- see that hook's
 * own docblock for why the handle button only carries `handleProps`
 * while the whole `<tr>` carries `setNodeRef`/`style`.
 */
function SortableRecordRow( { record, children } ) {
	const { setNodeRef, style, handleProps } = useSortableRow( record.id );

	return (
		<tr ref={ setNodeRef } style={ style }>
			<td className="gateway-records-crud-drag-handle">
				<button
					type="button"
					className="gateway-records-crud-drag-handle-button"
					aria-label="Drag to reorder"
					{ ...handleProps }
				>
					<GripVertical size={ 16 } aria-hidden="true" />
				</button>
			</td>
			{ children }
		</tr>
	);
}
