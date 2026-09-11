/**
 * gateway/data-cards' own "Filters" panel: renders the same click-to-toggle
 * list used for columns (AvailableColumnsList) and the drag-and-drop
 * reorder/compare/value table (FacetConfigTable) for the currently selected
 * facets.
 *
 * Which fields are offered is narrowed to `isFilterable` alone -- the
 * same flag `Column_Registry` computes for every field type (see that
 * class's own docblock), true for anything `Facet_Query::apply_facets()`/
 * `apply_collection_facets()` can actually filter by.
 */

import { Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import AvailableColumnsList from './available-columns-list';
import FacetConfigTable from './facet-config-table';
import { DEFAULT_FACET_COMPARE } from './facet-compare-options';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns Every column/field available for the current post type/Collection -- narrowed to `isFilterable` internally for the toggle list, but kept in full to resolve labels/types for FacetConfigTable.
 * @param {boolean}  props.isLoading        Whether the available field list is still loading.
 * @param {string}   props.error            Error message, if the fetch failed.
 * @param {Object[]} props.facets           Selected facets: [{ key, compare, value }].
 * @param {Function} props.onChange         ( nextFacets ) => void.
 * @param {string}   [props.emptyMessage]   Shown when there's nothing filterable, in place of the toggle list. Defaults to a generic "nothing available" message; callers with a more specific reason (e.g. "select columns first") can override it.
 */
export default function FacetsPanel( {
	availableColumns,
	isLoading,
	error,
	facets,
	onChange,
	emptyMessage,
} ) {
	const selectableColumns = availableColumns.filter(
		( column ) => column.isFilterable
	);

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
	// sense for a taxonomy facet (see facet-config-table.js). Kept against
	// the full availableColumns (not the narrower selectableColumns) so a
	// facet still resolves a real label/type even in the brief window
	// before a no-longer-selectable facet is reconciled away by edit.js.
	const columnsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column;
		return acc;
	}, {} );

	return (
		<>
			{ selectableColumns.length ? (
				<AvailableColumnsList
					columns={ selectableColumns }
					selectedKeys={ facets.map( ( facet ) => facet.key ) }
					onToggle={ handleToggle }
				/>
			) : (
				<p className="gateway-columns-config__empty">
					{ emptyMessage ||
						__(
							'No fields are available to use as filters for this post type yet.',
							'gateway'
						) }
				</p>
			) }
			<FacetConfigTable
				facets={ facets }
				columnsByKey={ columnsByKey }
				onChange={ onChange }
				onRemove={ handleRemove }
			/>
		</>
	);
}
