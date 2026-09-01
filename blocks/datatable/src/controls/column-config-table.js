/**
 * Selected-columns configuration table: drag-and-drop to reorder, click to
 * toggle each column's DataTables sortability, and -- for a Number column
 * only -- a "Format" button opening a modal for Currency/Percent/decimal
 * settings.
 *
 * This whole UI lives in the Inspector sidebar (the block editor's top-level
 * admin document, not the iframed canvas), so plain HTML5 drag-and-drop is
 * all that's needed here -- no cross-iframe concerns like the DataTables
 * init in gateway/datatable-body/src/hooks/use-datatable-init.js has to
 * deal with.
 *
 * Format settings live in a `<Modal>` (`@wordpress/components`), the same
 * fix `facet-config-table.js`'s own "Default" button already applies for
 * Compare/Value: Style/Decimals/Thousands Separator/Currency Symbol/
 * Position is too much to add as more inline columns in this already
 * -narrow sidebar table without forcing horizontal scroll (the handle,
 * Column, Sortable, and Remove columns already fill the available width
 * on their own).
 */

import { useState } from '@wordpress/element';
import { Button, Modal } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import classnames from '../../../shared/classnames';
import NumberFormatControls from '../../../shared/controls/number-format-controls';

/**
 * @param {Object}   props
 * @param {Object[]} props.columns        Selected columns, in order: [{ key, sortable, format? }].
 * @param {Object}   props.labelsByKey    Map of key => friendly label, for display.
 * @param {Object}   props.numericByKey   Map of key => whether that column is a Number field (Column_Registry's own `isNumeric`) -- decides which rows get a Format button at all.
 * @param {Function} props.onChange       ( nextColumns ) => void, for reorder/sortable-toggle/format changes.
 * @param {Function} props.onRemove       ( key ) => void -- removes a column from the selection.
 */
export default function ColumnConfigTable( {
	columns,
	labelsByKey,
	numericByKey,
	onChange,
	onRemove,
} ) {
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );
	// The key of the column whose Format modal is currently open, if any --
	// a key rather than an index, same reasoning as FacetConfigTable's own
	// editingKey: it needs to keep pointing at the same column even if
	// `columns` reorders while the modal is open.
	const [ editingKey, setEditingKey ] = useState( null );

	if ( ! columns.length ) {
		return (
			<p className="gateway-columns-config__empty">
				{ __( 'Select at least one column above.', 'gateway' ) }
			</p>
		);
	}

	const moveColumn = ( fromIndex, toIndex ) => {
		if ( fromIndex === toIndex || fromIndex === null || toIndex === null ) {
			return;
		}

		const next = columns.slice();
		const [ moved ] = next.splice( fromIndex, 1 );
		next.splice( toIndex, 0, moved );
		onChange( next );
	};

	const toggleSortable = ( index ) => {
		const next = columns.map( ( column, i ) =>
			i === index ? { ...column, sortable: ! column.sortable } : column
		);
		onChange( next );
	};

	const updateColumn = ( key, changes ) => {
		const next = columns.map( ( column ) =>
			column.key === key ? { ...column, ...changes } : column
		);
		onChange( next );
	};

	const editingColumn = columns.find( ( column ) => column.key === editingKey );

	return (
		<>
			<table className="gateway-columns-config">
				<thead>
					<tr>
						<th className="gateway-columns-config__handle-col"></th>
						<th>{ __( 'Column', 'gateway' ) }</th>
						<th>{ __( 'Sortable', 'gateway' ) }</th>
						<th className="gateway-columns-config__format-col"></th>
						<th className="gateway-columns-config__remove-col"></th>
					</tr>
				</thead>
				<tbody>
					{ columns.map( ( column, index ) => (
						<tr
							key={ column.key }
							className={ classnames(
								'gateway-columns-config__row',
								dragIndex === index && 'is-dragging',
								overIndex === index && dragIndex !== index && 'is-drop-target'
							) }
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
							{ /* draggable lives on the handle, not the row, so a drag can
							   only be started from here -- not from anywhere else in the row. */ }
							<td
								className="gateway-columns-config__handle"
								aria-hidden="true"
								draggable
								onDragStart={ ( event ) => {
									setDragIndex( index );
									// Firefox requires data to be set for drag to start.
									event.dataTransfer.effectAllowed = 'move';
									event.dataTransfer.setData( 'text/plain', String( index ) );
								} }
							>
								⠿
							</td>
							<td>{ labelsByKey[ column.key ] || column.key }</td>
							<td>
								<Button
									variant="secondary"
									size="small"
									isPressed={ !! column.sortable }
									onClick={ () => toggleSortable( index ) }
								>
									{ column.sortable
										? __( 'Sortable', 'gateway' )
										: __( 'Not sortable', 'gateway' ) }
								</Button>
							</td>
							<td>
								{ numericByKey[ column.key ] && (
									<Button
										variant="secondary"
										size="small"
										isPressed={ Boolean( column.format ) }
										onClick={ () => setEditingKey( column.key ) }
									>
										{ __( 'Format', 'gateway' ) }
									</Button>
								) }
							</td>
							<td>
								<Button
									className="gateway-columns-config__remove"
									icon="no-alt"
									label={ __( 'Remove column', 'gateway' ) }
									size="small"
									isDestructive
									disabled={ columns.length <= 1 }
									onClick={ () => onRemove( column.key ) }
								/>
							</td>
						</tr>
					) ) }
				</tbody>
			</table>
			{ editingColumn && (
				<Modal
					title={ sprintf(
						/* translators: %s: column label. */
						__( 'Number format for “%s”', 'gateway' ),
						labelsByKey[ editingColumn.key ] || editingColumn.key
					) }
					onRequestClose={ () => setEditingKey( null ) }
					className="gateway-number-format-modal"
				>
					<NumberFormatControls
						format={ editingColumn.format }
						onChange={ ( format ) => updateColumn( editingColumn.key, { format } ) }
					/>
					<Button variant="primary" onClick={ () => setEditingKey( null ) }>
						{ __( 'Done', 'gateway' ) }
					</Button>
				</Modal>
			) }
		</>
	);
}
