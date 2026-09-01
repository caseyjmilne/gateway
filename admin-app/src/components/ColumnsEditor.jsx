import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';
import useFieldTypes from '../hooks/useFieldTypes.js';

/**
 * Model-level Records-table column configuration -- the **Columns** tab
 * on `ModelDetail`, beside Permalinks. What this solves: `RecordsCrud.jsx`
 * used to render every one of a model's own fields as a table column
 * unconditionally, which gets cluttered fast on a model with a lot of
 * fields.
 *
 * Deliberately mirrors `gateway/datatable`'s own column-picker UI (a
 * click-to-toggle "available" list above a drag-to-reorder "selected"
 * config table below, `blocks/shared/controls/available-columns-list.js`
 * + `blocks/datatable/src/controls/column-config-table.js`) -- same
 * shape, same class names even, reimplemented here in this app's own
 * plain-HTML idiom rather than shared code: the admin app is a
 * completely separate build from the Gutenberg blocks (see this app's
 * own README, "Plain React + Vite, not @wordpress/scripts"), so there's
 * no `@wordpress/components` here to import that UI from directly.
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
 * declutter) rather than an empty, misleading panel. Save is disabled
 * until something actually changes from that same computed default,
 * the same "nothing to persist yet" reasoning `PermalinkEditor.jsx`'s
 * own dirty-check already applies.
 *
 * A plain Save button, not autosave -- same reasoning `PermalinkEditor.jsx`'s
 * own docblock already gives: this is one coherent, ordered arrangement
 * (like Root/Template Page), not a set of small independent per-row
 * units the way FieldEditor's own per-keystroke autosave is appropriate
 * for.
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
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );
	const [ saving, setSaving ] = useState( false );
	const [ error, setError ] = useState( '' );
	const [ justSaved, setJustSaved ] = useState( false );

	// Re-seeds only when this model's own identity actually changes --
	// this component is remounted via `key={model.class}` from
	// ModelDetail on top of that (same convention FieldEditor/
	// RelationshipEditor already use), so this mainly guards against a
	// prop update on the SAME model (e.g. `fields` itself changing after
	// a field's renamed on the Fields tab) blowing away in-progress edits
	// here.
	useEffect( () => {
		setColumns( seedColumns() );
		setError( '' );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ modelClass ] );

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
		// table isn't useful, the same floor gateway/datatable's own
		// ColumnsPanel already enforces for its own column picker.
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

	const moveColumn = ( fromIndex, toIndex ) => {
		if ( fromIndex === toIndex || fromIndex === null || toIndex === null ) {
			return;
		}
		const next = columns.slice();
		const [ moved ] = next.splice( fromIndex, 1 );
		next.splice( toIndex, 0, moved );
		setColumns( next );
	};

	const dirty = JSON.stringify( columns ) !== JSON.stringify( seedColumns() );

	const handleSave = async () => {
		setSaving( true );
		setError( '' );

		try {
			const saved = await apiFetch(
				`/models/${ encodeURIComponent( modelClass ) }/columns`,
				{ method: 'PUT', body: JSON.stringify( { columns } ) }
			);
			setColumns( saved );
			setJustSaved( true );
			setTimeout( () => setJustSaved( false ), 1500 );
		} catch ( err ) {
			setError( err.message );
		} finally {
			setSaving( false );
		}
	};

	return (
		<div className="gateway-columns-editor">
			<h3>Columns</h3>
			<p className="description">
				Choose which fields show as columns on this model&rsquo;s own
				Records table, their order, and which of them can be clicked
				to sort the table.
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
								<tr
									key={ column.key }
									className={
										'gateway-columns-config__row' +
										( dragIndex === index ? ' is-dragging' : '' ) +
										( overIndex === index && dragIndex !== index
											? ' is-drop-target'
											: '' )
									}
									onDragOver={ ( event ) => {
										event.preventDefault();
										setOverIndex( index );
									} }
									onDrop={ ( event ) => {
										event.preventDefault();
										moveColumn( dragIndex, index );
										setDragIndex( null );
										setOverIndex( null );
									} }
									onDragEnd={ () => {
										setDragIndex( null );
										setOverIndex( null );
									} }
								>
									<td
										className="gateway-columns-config__handle"
										aria-hidden="true"
										draggable
										onDragStart={ ( event ) => {
											setDragIndex( index );
											event.dataTransfer.effectAllowed = 'move';
											event.dataTransfer.setData(
												'text/plain',
												String( index )
											);
										} }
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
								</tr>
							);
						} ) }
					</tbody>
				</table>
			) }

			<p>
				<button
					type="button"
					className="button button-primary"
					disabled={ saving || ! dirty }
					onClick={ handleSave }
				>
					{ saving ? 'Saving…' : 'Save' }
				</button>
				{ justSaved && ! dirty && (
					<span className="gateway-field-editor-save-status"> Saved</span>
				) }
			</p>
		</div>
	);
}
