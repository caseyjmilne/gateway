/**
 * Column selection + configuration panel: renders the click-to-toggle list
 * (AvailableColumnsList) and the drag-and-drop reorder/sortable-toggle
 * table (ColumnConfigTable) for the currently selected columns.
 *
 * Fetching the available column list and reconciling the selection against
 * post type changes both happen once, in edit.js (useAvailableColumns(),
 * useReconcileFieldList()), and are shared with FacetsPanel -- this
 * component just renders against whatever it's handed.
 */

import { Notice, Spinner } from '@wordpress/components';

import AvailableColumnsList from './available-columns-list';
import ColumnConfigTable from './column-config-table';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns Columns available for the current post type.
 * @param {boolean}  props.isLoading        Whether the available column list is still loading.
 * @param {string}   props.error            Error message, if the fetch failed.
 * @param {Object[]} props.columns          Selected columns: [{ key, sortable }].
 * @param {Function} props.onChange         ( nextColumns ) => void.
 */
export default function ColumnsPanel( {
	availableColumns,
	isLoading,
	error,
	columns,
	onChange,
} ) {
	// Shared by both removal paths: clicking a selected name in the
	// available-columns list above, and the "×" remove button in the
	// column-config table below.
	const handleRemove = ( key ) => {
		// Keep at least one column selected: an empty grid isn't useful,
		// and would leave DataTables with no columns to initialize against.
		if ( columns.length <= 1 ) {
			return;
		}
		onChange( columns.filter( ( column ) => column.key !== key ) );
	};

	const handleToggle = ( key ) => {
		const isSelected = columns.some( ( column ) => column.key === key );

		if ( isSelected ) {
			handleRemove( key );
		} else {
			onChange( [ ...columns, { key, sortable: true } ] );
		}
	};

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( error ) {
		return (
			<Notice status="error" isDismissible={ false }>
				{ error }
			</Notice>
		);
	}

	const labelsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column.label;
		return acc;
	}, {} );

	return (
		<>
			<AvailableColumnsList
				columns={ availableColumns }
				selectedKeys={ columns.map( ( column ) => column.key ) }
				onToggle={ handleToggle }
			/>
			<ColumnConfigTable
				columns={ columns }
				labelsByKey={ labelsByKey }
				onChange={ onChange }
				onRemove={ handleRemove }
			/>
		</>
	);
}
