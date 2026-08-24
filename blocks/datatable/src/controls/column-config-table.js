/**
 * Selected-columns configuration table: drag-and-drop to reorder, click to
 * toggle each column's DataTables sortability.
 *
 * This whole UI lives in the Inspector sidebar (the block editor's top-level
 * admin document, not the iframed canvas), so plain HTML5 drag-and-drop is
 * all that's needed here -- no cross-iframe concerns like the DataTables
 * init in hooks/use-datatable-init.js has to deal with.
 */

import { useState } from '@wordpress/element';
import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import classnames from '../utils/classnames';

/**
 * @param {Object}   props
 * @param {Object[]} props.columns     Selected columns, in order: [{ key, sortable }].
 * @param {Object}   props.labelsByKey Map of key => friendly label, for display.
 * @param {Function} props.onChange    ( nextColumns ) => void, for reorder/sortable-toggle.
 * @param {Function} props.onRemove    ( key ) => void -- removes a column from the selection.
 */
export default function ColumnConfigTable( { columns, labelsByKey, onChange, onRemove } ) {
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );

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

	return (
		<table className="gateway-columns-config">
			<thead>
				<tr>
					<th className="gateway-columns-config__handle-col"></th>
					<th>{ __( 'Column', 'gateway' ) }</th>
					<th>{ __( 'Sortable', 'gateway' ) }</th>
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
	);
}
