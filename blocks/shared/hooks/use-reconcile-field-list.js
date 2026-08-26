/**
 * Keeps a selection of { key, ... } entries (e.g. gateway/datatable's
 * `columns`/`facets` attributes, or gateway/data-cards' own `facets`) in
 * sync with the columns currently available for a post type: drops
 * entries whose key no longer exists (e.g. a meta field specific to a
 * previously selected post type), falling back to `defaultValue` (itself
 * filtered the same way) if that empties the selection.
 *
 * Fully generic over whatever "available" list the caller passes --
 * gateway/datatable/edit.js uses it three ways (columns against every
 * available field; facets against currently-displayed columns) and
 * gateway/data-cards/edit.js reconciles its own `facets` against
 * `isFilterable` fields the same way. Originally lived under
 * blocks/datatable/src/hooks/ as gateway/datatable's own hook; moved
 * here, unchanged, once gateway/data-cards needed it too.
 */

import { useEffect, useRef } from '@wordpress/element';

function fieldListsAreEqual( a, b ) {
	return (
		a.length === b.length &&
		a.every( ( item, index ) => b[ index ] && item.key === b[ index ].key )
	);
}

/**
 * @param {Object[]} availableColumns Columns available for the current post type.
 * @param {Object[]} value            Current selection: [{ key, ... }].
 * @param {Function} onChange         ( nextValue ) => void.
 * @param {Object[]} defaultValue     Fallback selection if reconciling empties `value`.
 */
export function useReconcileFieldList( availableColumns, value, onChange, defaultValue = [] ) {
	// Read the *latest* value/onChange without needing them in the
	// dependency array below -- this should only re-run when the available
	// columns themselves change (i.e. the post type changed), not on every
	// selection change.
	const valueRef = useRef( value );
	valueRef.current = value;
	const onChangeRef = useRef( onChange );
	onChangeRef.current = onChange;

	useEffect( () => {
		if ( ! availableColumns.length ) {
			return;
		}

		const availableKeys = availableColumns.map( ( column ) => column.key );
		const reconciled = valueRef.current.filter( ( item ) =>
			availableKeys.includes( item.key )
		);
		const finalValue = reconciled.length
			? reconciled
			: defaultValue.filter( ( item ) => availableKeys.includes( item.key ) );

		if ( ! fieldListsAreEqual( finalValue, valueRef.current ) ) {
			onChangeRef.current( finalValue );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ availableColumns ] );
}
