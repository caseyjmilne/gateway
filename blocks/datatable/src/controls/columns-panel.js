/**
 * Column selection + configuration panel: renders the click-to-toggle list
 * (AvailableColumnsList) and the drag-and-drop reorder/sortable-toggle/
 * Format table (ColumnConfigTable) for the currently selected columns.
 *
 * Fetching the available column list and reconciling the selection against
 * post type changes both happen once, in edit.js (useAvailableColumns(),
 * useReconcileFieldList()), and are shared with FacetsPanel -- this
 * component just renders against whatever it's handed. `numericByKey`
 * (derived here from `availableColumns`' own `isNumeric`) is this panel's
 * one own bit of derived state, computed the same way `labelsByKey`
 * already was -- ColumnConfigTable only needs a plain key => bool map,
 * not the full column objects.
 */

import { Notice, Spinner } from '@wordpress/components';

import AvailableColumnsList from '../../../shared/controls/available-columns-list';
import ColumnConfigTable from './column-config-table';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns Columns available for the current post type.
 * @param {boolean}  props.isLoading        Whether the available column list is still loading.
 * @param {string}   props.error            Error message, if the fetch failed.
 * @param {Object[]} props.columns          Selected columns: [{ key, sortable, format? }].
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

	// Which selected columns get a "Format" button at all -- see
	// ColumnConfigTable's own docblock. Column_Registry::
	// get_columns_for_collection()'s own `isNumeric` (Field_Type::
	// is_numeric(), true only for Number/Range) is the same eligibility
	// gateway/card-field-number's own Field picker uses.
	const numericByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = true === column.isNumeric;
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
				numericByKey={ numericByKey }
				onChange={ onChange }
				onRemove={ handleRemove }
			/>
		</>
	);
}
