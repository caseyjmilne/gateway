import { useEffect, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';
import useReorderSensors from '../hooks/useReorderSensors.js';
import useSortableRow from '../hooks/useSortableRow.js';
import DndSortableGroup from './DndSortableGroup.jsx';

/**
 * Model-level Records-table column configuration -- the **Columns** tab
 * on `ModelDetail`, beside Single Record. What this solves: `RecordsCrud.jsx`
 * used to render every one of a model's own fields as a table column
 * unconditionally, which gets cluttered fast on a model with a lot of
 * fields.
 *
 * A click-to-toggle "available" list above a drag-to-reorder "selected"
 * config table below -- the same shape, and even the same class names,
 * as gateway/data-cards' own Filters panel
 * (`blocks/shared/controls/available-columns-list.js`), reimplemented
 * here in this app's own plain-HTML idiom rather than shared code: the
 * admin app is a completely separate build from the Gutenberg blocks
 * (see this app's own README, "Plain React + Vite, not
 * @wordpress/scripts"), so there's no `@wordpress/components` here to
 * import that UI from directly. The drag-to-reorder mechanism itself is
 * `@dnd-kit` (`useSortableRow()`/
 * `DndSortableGroup()`, shared with RecordsCrud's own Position-sorted
 * table, FieldEditor's own Fields list, and ChoicesEditor's own choice
 * rows), not the plain native HTML5 drag-and-drop this used to use --
 * that version only ever moved the "⠿" handle itself during a drag,
 * with no other row visibly shifting to make room. `column.key` (a
 * field's own unique name) is already a real, stable id on its own --
 * unlike ChoicesEditor's own choices, nothing synthetic needs generating
 * here for `@dnd-kit` to track a drag by.
 *
 * **Show or not** is the main option (per the feature's own framing):
 * clicking a field's name in the available list toggles it in/out of
 * the table entirely. **Sortable or not** is the config table's own
 * per-row toggle -- disabled outright for a field whose type has no
 * real column to sort BY at all (`has_column` -- Field_Type_Registry's
 * own exposure of `Field_Type::blueprint_method() === ''`, currently
 * only Relate to Many, backed by a pivot table rather than a column on
 * this model's own table). There's no per-column settings MODAL here
 * the way the block's own Format button opens one for a Number column --
 * Sortable is this feature's only per-column setting, a single boolean
 * fits as a plain inline toggle button, same as the block's own
 * Sortable column already is (only Format, a genuinely multi-field
 * settings group, earns a modal there).
 *
 * **Unconfigured** (`initialColumns` is `null` -- this model has never
 * had Columns saved at all, see `Model_Columns`' own docblock) seeds
 * this tab's own local editing state with every CURRENT field, in their
 * existing Fields-tab order, none marked sortable -- exactly what's
 * already effectively showing today, so opening this tab for the first
 * time shows a working set that already matches reality (deselect to
 * declutter) rather than an empty, misleading panel. Nothing is sent to
 * the server just from that initial seeding -- only an actual EDIT
 * (toggle/reorder/add/remove) does, the same "compare against a freshly
 * recomputed default, only a real difference is worth persisting"
 * reasoning `dirty` checks elsewhere in this admin app already use, just
 * driving an autosave effect here instead of a Save button's own
 * disabled state.
 *
 * Autosaves on every change (toggle Sortable, add/remove a column,
 * reorder by drag), debounced -- per a direct report that a site owner
 * missed the previous version's own explicit Save button entirely
 * ("switching column to sortable has no effect... on refresh sortable
 * is lost") and a follow-up direct request, "we need to make this save
 * automatically because it's how people expect it to work." This used
 * to be a deliberate exception (a plain Save button, NOT autosave,
 * reasoned as "one coherent, ordered arrangement, not a set of small
 * independent per-row units the way FieldEditor's own per-keystroke
 * autosave is appropriate for") -- superseded by that direct request;
 * every OTHER per-field control in this admin app already autosaves
 * (FieldEditor's own settings, PermalinkEditor's own Root/Template
 * Page), so a lone manual Save button here was the inconsistent choice
 * in practice, not the other way around.
 *
 * The autosave mechanism itself is a smaller version of FieldEditor's
 * own debounced-write chain (`lastSavedRef`/`saveChainRef`/
 * `debounceTimerRef`/`pendingColumnsRef`) -- simpler here because
 * there's no per-row draft/existing-field distinction to track, just one
 * whole ordered list saved as a unit: a change debounces briefly (so a
 * fast drag-reorder or several quick toggles collapse into one request,
 * not one per intermediate state), each attempt chains onto the last via
 * `saveChainRef` so two requests can never race and have the OLDER one's
 * response clobber the newer one's local state, and `lastSavedRef` -- a
 * plain serialized snapshot, not React state -- is what the effect
 * compares fresh `columns` against to know whether there's actually
 * anything new to persist (an unmodified "unconfigured" seed compares
 * equal to itself and never fires at all, same as `dirty` used to gate
 * the old Save button).
 */
export default function ColumnsEditor( { modelClass, fields, initialColumns } ) {
	const fieldTypes = useFieldTypes();

	const hasColumn = ( type ) => {
		const described = fieldTypes.find( ( fieldType ) => fieldType.key === type );
		// Defaults true while fieldTypes is still loading (or for a type
		// this app somehow doesn't recognize) -- the same "don't punish an
		// unloaded state" leniency as an absent flag anywhere else in this
		// admin app; the one real exception (Relate to Many) gets caught
		// again server-side by Model_Columns::set() regardless.
		return described ? described.has_column : true;
	};

	const defaultColumns = () =>
		fields.map( ( field ) => ( { key: field.name, sortable: false } ) );

	const seedColumns = () =>
		initialColumns && initialColumns.length ? initialColumns : defaultColumns();

	const [ columns, setColumns ] = useState( seedColumns );
	const dragSensors = useReorderSensors();
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ justSaved, setJustSaved ] = useState( false );

	// The last snapshot either already persisted (seeded from
	// `initialColumns`) or successfully autosaved -- a plain ref, not
	// React state, since nothing here should ever trigger its own
	// re-render; the autosave effect below is what actually reads it,
	// fresh, on every `columns` change. Reset alongside `columns` itself
	// whenever this model's own identity changes (see that effect below).
	const lastSavedRef = useRef( JSON.stringify( seedColumns() ) );
	// Every autosave attempt chains onto this instead of firing
	// independently, so two attempts arriving close together (a fast
	// drag-reorder immediately followed by a Sortable toggle, say) run
	// strictly one after another rather than racing -- the same
	// `saveChainRef` convention FieldEditor's own autosave already uses,
	// and for the identical reason: without it, an OLDER request's
	// response could resolve after a NEWER one's and clobber
	// `lastSavedRef`/local state with stale data.
	const saveChainRef = useRef( Promise.resolve() );
	const debounceTimerRef = useRef( null );
	// The columns snapshot a pending debounced save is currently waiting
	// to persist, if any -- null whenever nothing is pending. Needed so
	// this component's own unmount (navigating to a different model, or
	// away from this page entirely) can flush a change that's still
	// mid-wait rather than silently dropping it -- see the cleanup
	// function on the debounce effect below.
	const pendingColumnsRef = useRef( null );
	const savedFlashTimerRef = useRef( null );

	// Re-seeds only when this model's own identity actually changes --
	// this component is remounted via `key={model.class}` from
	// ModelDetail on top of that (same convention FieldEditor/
	// RelationshipEditor already use), so this mainly guards against a
	// prop update on the SAME model (e.g. `fields` itself changing after
	// a field's renamed on the Fields tab) blowing away in-progress edits
	// here.
	useEffect( () => {
		const seeded = seedColumns();
		setColumns( seeded );
		lastSavedRef.current = JSON.stringify( seeded );
		pendingColumnsRef.current = null;
		clearTimeout( debounceTimerRef.current );
		setError( '' );
		setSaving( false );
		setJustSaved( false );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ modelClass ] );

	// The actual autosave write -- chained onto saveChainRef (see that
	// ref's own comment above), so it's always this closure's own
	// snapshot that's sent, never a stale one a later call already
	// superseded.
	const persist = ( snapshot ) => {
		const run = () =>
			apiFetch(
				`/models/${ encodeURIComponent( modelClass ) }/columns`,
				{ method: 'PUT', body: JSON.stringify( { columns: snapshot } ) }
			)
				.then( ( saved ) => {
					lastSavedRef.current = JSON.stringify( saved );
					// The server's own sanitized shape is authoritative --
					// e.g. Sortable forced back off for a field whose type
					// has no real column, even if this snapshot asked for
					// it -- so local state is corrected to match it,
					// exactly as the old Save button's own
					// `setColumns( saved )` already did.
					setColumns( saved );
					setSaving( false );
					setJustSaved( true );
					clearTimeout( savedFlashTimerRef.current );
					savedFlashTimerRef.current = setTimeout( () => setJustSaved( false ), 1500 );
				} )
				.catch( ( err ) => {
					setError( err.message );
					setSaving( false );
				} );

		saveChainRef.current = saveChainRef.current.then( run, run );

		return saveChainRef.current;
	};

	// Debounces every `columns` change into at most one write per short
	// burst of activity -- a drag-reorder fires several intermediate
	// `columns` updates as it settles, and several quick Sortable toggles
	// in a row are common too; this collapses either into one request for
	// the FINAL state, not one per intermediate step.
	useEffect( () => {
		const serialized = JSON.stringify( columns );

		if ( serialized === lastSavedRef.current ) {
			// Already what's persisted (or, before any edit at all, the
			// same freshly-recomputed default `lastSavedRef` was seeded
			// with) -- nothing new to autosave.
			return;
		}

		setError( '' );
		setSaving( true );
		clearTimeout( debounceTimerRef.current );
		pendingColumnsRef.current = columns;

		debounceTimerRef.current = setTimeout( () => {
			pendingColumnsRef.current = null;
			persist( columns );
		}, 500 );

		return () => {
			clearTimeout( debounceTimerRef.current );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ columns ] );

	// Flushes a still-pending debounced write immediately when this
	// component unmounts (navigating to a different model swaps this
	// component out via ModelDetail's own `key={model.class}`, or the
	// admin page is left entirely) -- the same "don't silently drop an
	// in-flight edit" reasoning FieldEditor's own autosave cleanup
	// already follows for the identical reason.
	useEffect( () => {
		return () => {
			clearTimeout( debounceTimerRef.current );
			clearTimeout( savedFlashTimerRef.current );

			if ( pendingColumnsRef.current ) {
				persist( pendingColumnsRef.current );
				pendingColumnsRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const labelsByKey = fields.reduce( ( acc, field ) => {
		acc[ field.name ] = field.label || field.name;
		return acc;
	}, {} );

	const selectedKeys = columns.map( ( column ) => column.key );

	const handleToggle = ( key ) => {
		if ( selectedKeys.includes( key ) ) {
			handleRemove( key );
		} else {
			setColumns( [ ...columns, { key, sortable: false } ] );
		}
	};

	const handleRemove = ( key ) => {
		// Keep at least one column shown -- an entirely empty Records
		// table isn't useful.
		if ( columns.length <= 1 ) {
			return;
		}
		setColumns( columns.filter( ( column ) => column.key !== key ) );
	};

	const toggleSortable = ( index ) => {
		setColumns(
			columns.map( ( column, i ) =>
				i === index ? { ...column, sortable: ! column.sortable } : column
			)
		);
	};

	const handleDragEnd = ( event ) => {
		const { active, over } = event;

		if ( ! over || active.id === over.id ) {
			return;
		}

		const fromIndex = columns.findIndex( ( column ) => column.key === active.id );
		const toIndex = columns.findIndex( ( column ) => column.key === over.id );

		if ( -1 === fromIndex || -1 === toIndex ) {
			return;
		}

		setColumns( arrayMove( columns, fromIndex, toIndex ) );
	};

	return (
		<div className="gateway-columns-editor">
			<h3>Columns</h3>
			<p className="description">
				Choose which fields show as columns on this model&rsquo;s own
				Records table, their order, and which of them can be clicked
				to sort the table. Changes save automatically.
			</p>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			<div className="gateway-columns-available">
				<ul className="gateway-columns-available__list">
					{ fields.map( ( field ) => {
						const isSelected = selectedKeys.includes( field.name );

						return (
							<li key={ field.name }>
								<button
									type="button"
									className={
										'gateway-columns-available__item' +
										( isSelected ? ' is-selected' : '' )
									}
									aria-pressed={ isSelected }
									onClick={ () => handleToggle( field.name ) }
								>
									{ field.label || field.name }
								</button>
							</li>
						);
					} ) }
				</ul>
			</div>

			{ 0 === columns.length ? (
				<p className="gateway-columns-config__empty">
					Select at least one field above.
				</p>
			) : (
				<DndSortableGroup
					enabled
					sensors={ dragSensors }
					onDragEnd={ handleDragEnd }
					itemIds={ columns.map( ( column ) => column.key ) }
				>
				<table className="gateway-columns-config">
					<thead>
						<tr>
							<th className="gateway-columns-config__handle-col"></th>
							<th>Column</th>
							<th>Sortable</th>
							<th className="gateway-columns-config__remove-col"></th>
						</tr>
					</thead>
					<tbody>
						{ columns.map( ( column, index ) => {
							const type = fields.find(
								( field ) => field.name === column.key
							)?.type;

							return (
								<SortableColumnRow key={ column.key } id={ column.key }>
									{ ( handleProps ) => (
										<>
											<td
												className="gateway-columns-config__handle"
												aria-hidden="true"
												{ ...handleProps }
											>
												⠿
											</td>
											<td>{ labelsByKey[ column.key ] || column.key }</td>
											<td>
												<button
													type="button"
													className="button"
													disabled={ ! hasColumn( type ) }
													title={
														hasColumn( type )
															? undefined
															: 'This field type has no real column to sort by.'
													}
													onClick={ () => toggleSortable( index ) }
												>
													{ column.sortable ? 'Sortable' : 'Not sortable' }
												</button>
											</td>
											<td>
												<button
													type="button"
													className="button gateway-columns-config__remove"
													aria-label={ `Remove ${ labelsByKey[ column.key ] || column.key }` }
													disabled={ columns.length <= 1 }
													onClick={ () => handleRemove( column.key ) }
												>
													×
												</button>
											</td>
										</>
									) }
								</SortableColumnRow>
							);
						} ) }
					</tbody>
				</table>
				</DndSortableGroup>
			) }

			<p>
				{ saving && (
					<span className="gateway-field-editor-save-status">Saving…</span>
				) }
				{ ! saving && justSaved && (
					<span className="gateway-field-editor-save-status">Saved</span>
				) }
			</p>
		</div>
	);
}

/**
 * One draggable column row. `useSortableRow()` (shared with RecordsCrud's
 * own Position-sorted table, FieldEditor's own Fields list, and
 * ChoicesEditor's own choice rows) does the actual `@dnd-kit/sortable`
 * wiring -- see that hook's own docblock for why the "⠿" handle cell
 * only ever receives `handleProps` while the whole `<tr>` carries
 * `setNodeRef`/`style`. `children` is a render prop (a function) so the
 * row's own cells can receive that real `handleProps`.
 */
function SortableColumnRow( { id, children } ) {
	const { setNodeRef, style, handleProps } = useSortableRow( id );

	return (
		<tr ref={ setNodeRef } style={ style } className="gateway-columns-config__row">
			{ children( handleProps ) }
		</tr>
	);
}
