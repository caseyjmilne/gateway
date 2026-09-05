import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { arrayMove } from '@dnd-kit/sortable';
import { GripVertical, ChevronsUp, ChevronsDown, ChevronsUpDown } from 'lucide-react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useResolvedModelClass from '../hooks/useResolvedModelClass.js';
import useReorderSensors from '../hooks/useReorderSensors.js';
import useSortableRow from '../hooks/useSortableRow.js';
import RecordForm from '../components/RecordForm.jsx';
import Modal from '../components/Modal.jsx';
import DndSortableGroup from '../components/DndSortableGroup.jsx';
import { getRecordPermalink } from '../utils/permalink.js';

const PER_PAGE = 20;

/**
 * How many of the page-size <select>'s own options to offer -- the same
 * "reasonable, small, fixed set" every other length-menu in this plugin
 * already uses (e.g. gateway/datatable's own default length menu).
 */
const PER_PAGE_OPTIONS = [ 10, 20, 50, 100 ];

/**
 * How long a pause in typing, in ms, before the search box's own value
 * actually fires a request -- long enough that a normal typing cadence
 * never fires one per keystroke, short enough that it still feels
 * immediate once someone stops.
 */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * A permissive, best-effort comparator for `handleSort()`'s own instant,
 * client-side resort -- never the authoritative sort (the server's real
 * `ORDER BY`, which always follows a moment later to confirm/correct
 * this), so it only needs to be "usually right," not exhaustively
 * correct for every locale/collation edge case a real SQL sort handles.
 */
function compareForInstantSort( a, b ) {
	if ( 'number' === typeof a && 'number' === typeof b ) {
		return a - b;
	}

	return String( a ?? '' ).localeCompare( String( b ?? '' ), undefined, {
		numeric: true,
		sensitivity: 'base',
	} );
}

/**
 * Whether every one of `records`' own values for `key` is a plain scalar
 * (string/number/boolean/null) -- the only shapes `compareForInstantSort()`
 * above handles meaningfully. A structured value (a Relate/Image/User/...
 * field's own enriched `{id, label}`-shaped object, or an array of them)
 * has no single obvious "compare these" rule worth guessing at
 * client-side, so a column full of those simply skips the instant resort
 * and waits for the server's own authoritative response instead -- see
 * `handleSort()`'s own docblock.
 */
function isInstantlySortable( records, key ) {
	return records.every( ( record ) => {
		const value = record[ key ];
		return (
			null === value ||
			undefined === value ||
			'string' === typeof value ||
			'number' === typeof value ||
			'boolean' === typeof value
		);
	} );
}

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
	const { modelSlug } = useParams();
	// The slug is what the URL actually carries -- everything below still
	// works in terms of the real class name, resolved once here (see
	// that hook's own docblock for why this fetches the models list
	// rather than adding a dedicated REST route just for this lookup).
	const { className, error: slugError } = useResolvedModelClass( modelSlug );
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
	// User-selectable, via the page-size <select> below -- overridden by
	// POSITION_PER_PAGE whenever this model has a Position field (see
	// that constant's own docblock), same as the fixed PER_PAGE default
	// this replaces was.
	const [ perPage, setPerPage ] = useState( PER_PAGE );
	const [ loadingRecords, setLoadingRecords ] = useState( true );
	const [ recordsError, setRecordsError ] = useState( '' );

	// The search box's own live value (`searchInput`, updates every
	// keystroke) vs. what's actually been SENT to the server (`search`,
	// updates only after the debounce effect below settles) -- the
	// classic split for a search-as-you-type control that shouldn't fire
	// a request per keystroke.
	const [ searchInput, setSearchInput ] = useState( '' );
	const [ search, setSearch ] = useState( '' );

	// True once this MODEL's own records have loaded successfully at
	// least once -- reset to false on a genuine model switch (below), so
	// a brand new model's own first load still gets the classic full-page
	// "Loading…" treatment (there's no existing table shape worth holding
	// onto yet). Every load AFTER that first one keeps the table -- and
	// its headers -- mounted throughout instead of tearing the whole
	// thing down to a bare "Loading…" and rebuilding it a moment later,
	// which is what made even a single-column sort click look like the
	// entire screen had reloaded. See `rowsPending` below for what
	// actually shows in the row area meanwhile.
	const [ hasLoadedOnce, setHasLoadedOnce ] = useState( false );

	// Whether the table's own ROWS specifically should show a skeleton
	// placeholder while `loadingRecords` is true -- as opposed to simply
	// leaving whatever's already in `records` on screen. Sorting the
	// column currently loaded via `handleSort()`'s own instant client
	// -side resort (see that function's own docblock) never sets this:
	// the rows on screen are already showing the right order, so there's
	// nothing to visually replace while the network confirms it a moment
	// later. Every other reload that could show a genuinely DIFFERENT set
	// of records -- a page change, a sort that can't be resolved instantly
	// (jumping back to page 1 from elsewhere), or a refresh after
	// add/edit/delete -- sets this explicitly right before calling
	// `loadRecords()`.
	const [ rowsPending, setRowsPending ] = useState( false );

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
		// Waits for the slug to resolve to a real class name first (see
		// useResolvedModelClass()'s own docblock) -- a slug that never
		// resolves (slugError set instead) is handled by the JSX below,
		// since this effect body never runs at all in that case.
		if ( ! className ) {
			return;
		}

		let cancelled = false;

		setModel( null );
		setModelError( '' );
		setShowAddForm( false );
		setEditingId( null );
		// A genuinely different model's own Records screen starts fresh --
		// its own first load still deserves the classic full-page
		// "Loading…" treatment (see `hasLoadedOnce`'s own docblock), and a
		// leftover search term/page size from whichever model was showing
		// before has no business carrying over to this one.
		setHasLoadedOnce( false );
		setSearchInput( '' );
		setSearch( '' );
		setPerPage( PER_PAGE );

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

	/**
	 * Deliberately takes one options object, not positional arguments --
	 * every call site passes ALL FIVE of page/orderBy/order/search/perPage
	 * explicitly (via `refetch()` below, which fills in whichever of them
	 * a given call isn't changing from current state) rather than this
	 * function reading any of them from its own closure. That's what lets
	 * this stay a stable `useCallback` depending on nothing but
	 * `basePath`/`positionField` -- reading `page`/`orderBy`/etc. from
	 * closure instead would mean a new function identity on every one of
	 * ITS OWN state updates, which would in turn re-fire the initial-load
	 * effect below (it depends on `loadRecords`'s own identity) on every
	 * single fetch this function itself completes -- an infinite loop.
	 *
	 * `search`/`perPage` are the two new query-string params this endpoint
	 * gained alongside DataTables-style pagination controls -- `search`
	 * is a global LIKE search across every filterable field
	 * (`Records_REST_Controller::list_records()`'s own docblock), and
	 * `perPage` a user-selectable page size, both capped/validated
	 * server-side the exact same way `orderby`/`order` already are.
	 */
	const loadRecords = useCallback(
		async ( { page: targetPage, orderBy: targetOrderBy, order: targetOrder, search: targetSearch, perPage: targetPerPage } ) => {
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
					// sorted by, or which page size is otherwise selected.
					per_page: positionField ? POSITION_PER_PAGE : targetPerPage,
					orderby: targetOrderBy,
					order: targetOrder,
				} );

				if ( targetSearch ) {
					params.set( 'search', targetSearch );
				}

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
				setHasLoadedOnce( true );
			} catch ( err ) {
				setRecordsError( err.message );
			} finally {
				setLoadingRecords( false );
			}
		},
		[ basePath, positionField ]
	);

	/**
	 * The thin wrapper every call site below actually calls -- fills in
	 * whichever of page/orderBy/order/search/perPage `overrides` doesn't
	 * specify from current state, so e.g. the Delete handler only needs
	 * `refetch({ page, orderBy, order })` (unchanged search/perPage) while
	 * the search box only needs `refetch({ search: value, page: 1 })`.
	 * Reading current state here (rather than in `loadRecords` itself) is
	 * exactly what's safe to do in a plain function recreated every
	 * render -- it's never itself a `useCallback`/effect dependency,
	 * unlike `loadRecords`.
	 */
	const refetch = ( overrides = {} ) =>
		loadRecords( {
			page: overrides.page ?? page,
			orderBy: overrides.orderBy ?? orderBy,
			order: overrides.order ?? order,
			search: overrides.search ?? search,
			perPage: overrides.perPage ?? perPage,
		} );

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

		loadRecords( {
			page: 1,
			orderBy: positionField ? positionField.name : 'id',
			order: positionField ? 'asc' : 'desc',
			search: '',
			perPage: PER_PAGE,
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only
		// re-fetches on a genuine model switch (model/positionField, both
		// derived from the same model fetch) or a deliberate handleSort()/
		// drag reorder/search/page-size change (which all go through
		// `refetch()`, reading their own current state directly, not via
		// this effect) -- orderBy/order/search/perPage are deliberately
		// left out of this dependency list so loadRecords() correcting
		// orderBy/order back from the server's own response (just above)
		// never triggers a second, redundant fetch.
	}, [ model, positionField, loadRecords ] );

	// Debounced search-as-you-type: `search` (what's actually sent) only
	// catches up to `searchInput` (what's actually typed) once typing
	// pauses for SEARCH_DEBOUNCE_MS -- see the effect below this one for
	// what actually fires the request once it does.
	useEffect( () => {
		const handle = setTimeout( () => {
			setSearch( searchInput );
		}, SEARCH_DEBOUNCE_MS );

		return () => clearTimeout( handle );
	}, [ searchInput ] );

	useEffect( () => {
		// Guards against firing on this component's own very first mount
		// (this effect runs once regardless of whether `search` "changed"
		// at all, same as every other effect does) AND against the
		// model-switch effect above resetting `search` back to '' --
		// `hasLoadedOnce` is reset to false in that SAME synchronous
		// update, so it's still false by the time this effect's own
		// dependency check runs; either way, the initial-load effect
		// above already owns that first fetch.
		if ( ! hasLoadedOnce ) {
			return;
		}

		setRowsPending( true );
		refetch( { page: 1, search } );
		// eslint-disable-next-line react-hooks/exhaustive-deps -- fires
		// only on a genuine `search` change (the debounce effect above is
		// the only thing that ever changes it); `refetch` itself reads
		// every OTHER current value directly, not through this
		// dependency list.
	}, [ search ] );

	const handleSort = ( key ) => {
		const nextOrder = key === orderBy && 'asc' === order ? 'desc' : 'asc';

		// The instant, no-flash resort this whole feature exists for:
		// re-sorts whatever's ALREADY on screen immediately, client-side,
		// rather than waiting on a round trip -- correct as long as
		// what's on screen is genuinely the same set of records the next
		// page load would show anyway. That's true exactly when (a) we're
		// already on page 1, the only page a sort-triggered reload ever
		// targets, so nothing outside the currently-loaded rows could
		// possibly need to appear, and (b) every record's own value for
		// this column is a plain scalar `compareForInstantSort()` can
		// actually compare -- a structured (Relate/Image/User/...) column
		// has no obvious client-side "compare these" rule worth guessing
		// at, so those fall through to the plain skeleton-while-loading
		// path below instead, same as a genuine page change would.
		//
		// Either way, the real request still fires right behind it
		// (`refetch()` below) to confirm/correct this guess against the
		// server's own authoritative order -- this is a perceived-instant
		// preview, never a replacement for the real sort.
		if ( 1 === page && isInstantlySortable( records, key ) ) {
			const resorted = [ ...records ].sort( ( a, b ) => {
				const cmp = compareForInstantSort( a[ key ], b[ key ] );
				return 'asc' === nextOrder ? cmp : -cmp;
			} );
			setRecords( resorted );
			setOrderBy( key );
			setOrder( nextOrder );
			setRowsPending( false );
		} else {
			setRowsPending( true );
		}

		refetch( { page: 1, orderBy: key, order: nextOrder } );
	};

	const handlePerPageChange = ( event ) => {
		const value = parseInt( event.target.value, 10 );
		setPerPage( value );
		setRowsPending( true );
		refetch( { page: 1, perPage: value } );
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
			// Preserves whatever sort/search/page size is currently
			// showing (id/desc puts a new record first, but a site owner
			// already sorted by, say, Title -- or filtered by a search
			// term -- has no reason to have any of that silently reset
			// just because a record was added).
			setRowsPending( true );
			refetch( { page: 1 } );
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
			setRowsPending( true );
			refetch();
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
			setRowsPending( true );
			refetch();
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
			setRowsPending( true );
			refetch();
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
	// dragged. A non-empty search ALSO disables this -- dragging within a
	// FILTERED subset would renumber only those records' own Position
	// values to 0, 1, 2, ..., colliding with the untouched records the
	// search is currently hiding rather than actually reordering anything
	// against the model's real, complete ordering.
	const canReorder =
		Boolean( positionField ) &&
		orderBy === positionField.name &&
		'asc' === order &&
		'' === search &&
		total <= records.length;

	const effectivePerPage = positionField ? POSITION_PER_PAGE : perPage;
	const totalPages = Math.max( 1, Math.ceil( total / effectivePerPage ) );
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
			{ slugError && (
				<div className="notice notice-error">
					<p>{ slugError }</p>
				</div>
			) }

			{ modelError && (
				<div className="notice notice-error">
					<p>{ modelError }</p>
				</div>
			) }

			{ model && (
				<>
					<h2 className="gateway-records-crud-heading">
						<code className="gateway-records-crud-model-badge">
							{ model.class }
						</code>{ ' ' }
						Records
					</h2>

					{ fields.length === 0 ? (
						<p className="description">
							This model has no fields yet -- add some on its{ ' ' }
							<Link to={ `/models/${ model.slug }` }>
								Models
							</Link>{ ' ' }
							screen first.
						</p>
					) : (
						<>
							<div className="gateway-records-crud-toolbar">
								<button
									type="button"
									className="button button-primary"
									onClick={ () => setShowAddForm( true ) }
								>
									Add New
								</button>

								<input
									type="search"
									className="gateway-records-crud-search"
									placeholder="Search records…"
									aria-label="Search records"
									value={ searchInput }
									onChange={ ( event ) =>
										setSearchInput( event.target.value )
									}
								/>

								{ ! positionField && (
									<label className="gateway-records-crud-per-page">
										Show{ ' ' }
										<select
											value={ perPage }
											onChange={ handlePerPageChange }
										>
											{ PER_PAGE_OPTIONS.map( ( option ) => (
												<option key={ option } value={ option }>
													{ option }
												</option>
											) ) }
										</select>{ ' ' }
										per page
									</label>
								) }
							</div>

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

							{ hasLoadedOnce && loadingRecords && rowsPending && (
								<span className="screen-reader-text" role="status">
									Refreshing records…
								</span>
							) }

							{ ! hasLoadedOnce && loadingRecords ? (
								<p>Loading…</p>
							) : 0 === records.length && ! loadingRecords ? (
								<p className="description">
									{ search
										? 'No records match your search.'
										: 'No records yet.' }
								</p>
							) : (
								// `rowsPending` decides what fills the ROW area
								// while a background reload is in flight -- see
								// that state's own docblock. Never a bare
								// "Loading…" swap for the whole block any more:
								// the table (headers included) stays mounted
								// throughout every load after the first.
								<DndSortableGroup
									enabled={ canReorder && ! ( loadingRecords && rowsPending ) }
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
										{ loadingRecords && rowsPending ? (
											<SkeletonRows
												rowCount={ Math.min(
													Math.max( records.length, 1 ),
													10
												) }
												columnCount={
													( canReorder ? 1 : 0 ) +
													1 +
													displayedFields.length +
													1
												}
											/>
										) : (
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
										) }
									</table>
								</DndSortableGroup>
							) }

							{ totalPages > 1 && (
								<p>
									<button
										type="button"
										className="button"
										onClick={ () => {
											setRowsPending( true );
											refetch( { page: page - 1 } );
										} }
										disabled={ page <= 1 || loadingRecords }
									>
										Previous
									</button>{ ' ' }
									Page { page } of { totalPages }{ ' ' }
									<button
										type="button"
										className="button"
										onClick={ () => {
											setRowsPending( true );
											refetch( { page: page + 1 } );
										} }
										disabled={ page >= totalPages || loadingRecords }
									>
										Next
									</button>
								</p>
							) }
						</>
					) }
				</>
			) }

			<p className="gateway-records-crud-back-link">
				<Link to="/records">&larr; Back to Records</Link>
			</p>

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
 * the component above) actually allows sorting by. The same three
 * lucide-react icons RecordsCrud's own drag handle (`GripVertical`)
 * already draws from, rather than plain inline `▲`/`▼` text: a neutral
 * `ChevronsUpDown` on every sortable-but-not-currently-active column
 * (signaling "sortable," not just "unsorted"), swapping to a single
 * -direction `ChevronsUp`/`ChevronsDown` only on the currently-active
 * column, matching whichever `order` the table is actually sorted by
 * right now (per `orderBy`/`order` reflecting the SERVER's own applied
 * sort, not just whatever was last clicked -- see `loadRecords()`'s own
 * docblock).
 */
function SortableHeader( { label, columnKey, orderBy, order, onSort } ) {
	const isActive = columnKey === orderBy;
	const Icon = isActive
		? ( 'asc' === order ? ChevronsUp : ChevronsDown )
		: ChevronsUpDown;

	return (
		<button
			type="button"
			className="gateway-records-crud-sort"
			onClick={ () => onSort( columnKey ) }
		>
			{ label }
			<Icon
				className={
					'gateway-records-crud-sort-icon' +
					( isActive ? ' gateway-records-crud-sort-icon--active' : '' )
				}
				size={ 14 }
				aria-hidden="true"
			/>
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

/**
 * Stands in for `<tbody>` while a background reload's own `rowsPending`
 * is true (see that state's own docblock) -- `rowCount` placeholder
 * `<tr>`s, each `columnCount` cells wide (matching whatever the REAL
 * rows would currently have: the drag-handle column when `canReorder`,
 * one per displayed field, plus the leading id and trailing actions
 * columns), so the table never visibly changes shape while this is
 * showing in place of real data. `aria-hidden` -- this is a purely
 * visual placeholder, not content a screen reader has any reason to
 * read row-by-row; the separate `role="status"` text rendered just
 * above the table (see the caller) is what actually announces "still
 * loading" to one instead.
 */
function SkeletonRows( { rowCount, columnCount } ) {
	return (
		<tbody className="gateway-records-crud-skeleton" aria-hidden="true">
			{ Array.from( { length: rowCount } ).map( ( _unused, rowIndex ) => (
				<tr key={ rowIndex }>
					{ Array.from( { length: columnCount } ).map( ( _unused2, colIndex ) => (
						<td key={ colIndex }>
							<span className="gateway-records-crud-skeleton-bar" />
						</td>
					) ) }
				</tr>
			) ) }
		</tbody>
	);
}
