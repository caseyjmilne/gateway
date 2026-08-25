/**
 * Facet selection + configuration panel: renders the same click-to-toggle
 * list used for columns (AvailableColumnsList) and the drag-and-drop
 * reorder/compare/value table (FacetConfigTable) for the currently selected
 * facets.
 *
 * Unlike the Columns panel, the toggle list here is *not* "every filterable
 * field for this post type" -- it's narrowed to only the fields already
 * selected as displayed columns. A facet only has something to hook into
 * once its field is also a displayed column (its DataTables column index is
 * how the front end targets it -- see gateway/facet's view.js), so a field
 * that isn't currently a column would just produce a facet with nothing to
 * filter. Restricting the list here prevents that state from being created
 * in the first place, rather than only warning about it after the fact (the
 * gateway/facet block's own "isn't currently a displayed column" notice
 * stays in place regardless, as defense in depth -- e.g. against a column
 * being removed while a facet block still references it).
 *
 * Unlike columns, an empty facet selection is a perfectly normal state (no
 * filtering applied), so there's no "keep at least one" guard here.
 */

import { Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import AvailableColumnsList from './available-columns-list';
import FacetConfigTable from './facet-config-table';
import { DEFAULT_FACET_COMPARE } from './facet-compare-options';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns Columns/fields available for the current post type.
 * @param {Object[]} props.displayedColumns Currently displayed columns: [{ key, sortable }] (the block's `columns` attribute) -- narrows the toggle list.
 * @param {boolean}  props.isLoading        Whether the available field list is still loading.
 * @param {string}   props.error            Error message, if the fetch failed.
 * @param {Object[]} props.facets           Selected facets: [{ key, compare, value }].
 * @param {Function} props.onChange         ( nextFacets ) => void.
 */
export default function FacetsPanel( {
	availableColumns,
	displayedColumns,
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
	// sense for a taxonomy facet (see facet-config-table.js). Kept against
	// the full availableColumns (not the narrowed list below) so a facet
	// still resolves a real label/type even in the brief window before a
	// no-longer-displayed facet is reconciled away by edit.js.
	const columnsByKey = availableColumns.reduce( ( acc, column ) => {
		acc[ column.key ] = column;
		return acc;
	}, {} );

	const displayedKeys = displayedColumns.map( ( column ) => column.key );
	const selectableColumns = availableColumns.filter( ( column ) =>
		displayedKeys.includes( column.key )
	);

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
					{ __(
						'Select one or more columns above before adding facets.',
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
