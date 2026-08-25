/**
 * Facet selection + configuration panel: renders the same click-to-toggle
 * list used for columns (AvailableColumnsList -- "all the filterable
 * fields" is the same field list as "all the displayable fields") and the
 * drag-and-drop reorder/compare/value table (FacetConfigTable) for the
 * currently selected facets.
 *
 * Unlike columns, an empty facet selection is a perfectly normal state (no
 * filtering applied), so there's no "keep at least one" guard here.
 */

import { Notice, Spinner } from '@wordpress/components';

import AvailableColumnsList from './available-columns-list';
import FacetConfigTable from './facet-config-table';
import { DEFAULT_FACET_COMPARE } from './facet-compare-options';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns Columns/fields available for the current post type.
 * @param {boolean}  props.isLoading        Whether the available field list is still loading.
 * @param {string}   props.error            Error message, if the fetch failed.
 * @param {Object[]} props.facets           Selected facets: [{ key, compare, value }].
 * @param {Function} props.onChange         ( nextFacets ) => void.
 */
export default function FacetsPanel( {
	availableColumns,
	isLoading,
	error,
	facets,
	onChange,
} ) {
	const handleRemove = ( key ) => {
		onChange( facets.filter( ( facet ) => facet.key !== key ) );
	};

	const handleToggle = ( key ) => {
		const isSelected = facets.some( ( facet ) => facet.key === key );

		if ( isSelected ) {
			handleRemove( key );
		} else {
			onChange( [
				...facets,
				{ key, compare: DEFAULT_FACET_COMPARE, value: '' },
			] );
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

	// Full column objects (key, label, *and* type), not just labels: the
	// config table needs `type` too, to restrict which Compare options make
	// sense for a taxonomy facet (see facet-config-table.js).
	const columnsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column;
		return acc;
	}, {} );

	return (
		<>
			<AvailableColumnsList
				columns={ availableColumns }
				selectedKeys={ facets.map( ( facet ) => facet.key ) }
				onToggle={ handleToggle }
			/>
			<FacetConfigTable
				facets={ facets }
				columnsByKey={ columnsByKey }
				onChange={ onChange }
				onRemove={ handleRemove }
			/>
		</>
	);
}
