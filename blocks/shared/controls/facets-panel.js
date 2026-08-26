/**
 * Facet selection + configuration panel: renders the same click-to-toggle
 * list used for columns (AvailableColumnsList) and the drag-and-drop
 * reorder/compare/value table (FacetConfigTable) for the currently selected
 * facets.
 *
 * Originally lived under blocks/datatable/src/controls/ as gateway/datatable's
 * own Facets panel; moved here, generalized, once gateway/data-cards needed
 * the same "pick a field, set a default value" UI (see FacetConfigTable's
 * own Default-value modal) for its own top-level Facets panel.
 *
 * The one real change from the original: which fields are offered
 * (`selectableColumns`) is now a prop the CALLER computes, not something
 * this component derives internally. gateway/datatable's own fields are
 * narrowed to "isFilterable AND currently a displayed column" -- a facet
 * only has something to hook into once its field is also a displayed
 * column, since its DataTables column index is how the front end targets
 * it (see gateway/facet's view.js). gateway/data-cards has no "displayed
 * columns" concept at all -- its own fields are narrowed to
 * "isFilterable" alone. Both callers already have everything needed to
 * compute their own list (Column_Registry's `isFilterable` flag, plus --
 * for the table only -- its own `columns` attribute), so pushing that
 * decision out to them keeps this component itself caller-agnostic
 * rather than hardcoding one family's own rule.
 */

import { Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

import AvailableColumnsList from './available-columns-list';
import FacetConfigTable from './facet-config-table';
import { DEFAULT_FACET_COMPARE } from './facet-compare-options';

/**
 * @param {Object}   props
 * @param {Object[]} props.availableColumns  Every column/field available for the current post type -- used to resolve labels/types for FacetConfigTable, independent of which are selectable.
 * @param {Object[]} props.selectableColumns Columns the toggle list actually offers -- computed by the caller (see this file's own docblock for why).
 * @param {boolean}  props.isLoading         Whether the available field list is still loading.
 * @param {string}   props.error             Error message, if the fetch failed.
 * @param {Object[]} props.facets            Selected facets: [{ key, compare, value }].
 * @param {Function} props.onChange          ( nextFacets ) => void.
 * @param {string}   [props.emptyMessage]    Shown when `selectableColumns` is empty, in place of the toggle list. Defaults to a generic "nothing available" message; callers with a more specific reason (e.g. "select columns first") can override it.
 */
export default function FacetsPanel( {
	availableColumns,
	selectableColumns,
	isLoading,
	error,
	facets,
	onChange,
	emptyMessage,
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
							'No fields are available to use as facets for this post type yet.',
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
