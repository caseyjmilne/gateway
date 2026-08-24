/**
 * Column selection + configuration panel: fetches the columns available for
 * the block's Post Type from the gateway/v1/columns/<post_type> REST route,
 * then renders the click-to-toggle list (AvailableColumnsList) and the
 * drag-and-drop reorder/sortable-toggle table (ColumnConfigTable) for the
 * currently selected ones.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import AvailableColumnsList from './available-columns-list';
import ColumnConfigTable from './column-config-table';

const DEFAULT_COLUMNS = [
	{ key: 'ID', sortable: true },
	{ key: 'post_title', sortable: true },
];

/**
 * Whether two column configs are equivalent (same keys, same order, same
 * sortable flags) -- used to avoid writing a new `columns` attribute (and
 * marking the post dirty) when reconciliation didn't actually change anything.
 */
function columnsAreEqual( a, b ) {
	return (
		a.length === b.length &&
		a.every( ( column, index ) => {
			const other = b[ index ];
			return other && column.key === other.key && !! column.sortable === !! other.sortable;
		} )
	);
}

/**
 * @param {Object}   props
 * @param {string}   props.postType Selected post type.
 * @param {Object[]} props.columns  Selected columns: [{ key, sortable }].
 * @param {Function} props.onChange ( nextColumns ) => void.
 */
export default function ColumnsPanel( { postType, columns, onChange } ) {
	const [ availableColumns, setAvailableColumns ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );

	// Effects below key exclusively on `postType` -- these refs let them
	// read the *latest* columns/onChange without also re-running (and
	// re-fetching) every time the user changes the column selection itself.
	const columnsRef = useRef( columns );
	columnsRef.current = columns;
	const onChangeRef = useRef( onChange );
	onChangeRef.current = onChange;

	useEffect( () => {
		let isCurrent = true;

		setIsLoading( true );
		setError( null );

		apiFetch( { path: `/gateway/v1/columns/${ postType }` } )
			.then( ( fetched ) => {
				if ( ! isCurrent ) {
					return;
				}

				setAvailableColumns( fetched );

				// Drop any selected columns that don't exist for the (new)
				// post type -- e.g. meta fields specific to the previously
				// selected one -- falling back to the default selection if
				// that empties the list entirely.
				const availableKeys = fetched.map( ( column ) => column.key );
				const reconciled = columnsRef.current.filter( ( column ) =>
					availableKeys.includes( column.key )
				);
				const finalColumns = reconciled.length
					? reconciled
					: DEFAULT_COLUMNS.filter( ( column ) => availableKeys.includes( column.key ) );

				if ( ! columnsAreEqual( finalColumns, columnsRef.current ) ) {
					onChangeRef.current( finalColumns );
				}
			} )
			.catch( ( fetchError ) => {
				if ( isCurrent ) {
					setError(
						fetchError?.message || __( 'Could not load columns.', 'gateway' )
					);
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoading( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ postType ] );

	const handleToggle = ( key ) => {
		const isSelected = columns.some( ( column ) => column.key === key );

		if ( isSelected ) {
			// Keep at least one column selected: an empty grid isn't useful,
			// and would leave DataTables with no columns to initialize against.
			if ( columns.length <= 1 ) {
				return;
			}
			onChange( columns.filter( ( column ) => column.key !== key ) );
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
			/>
		</>
	);
}
