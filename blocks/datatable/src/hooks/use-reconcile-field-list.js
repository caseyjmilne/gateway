/**
 * Keeps a selection of { key, ... } entries (the `columns` or `facets`
 * attribute) in sync with the columns currently available for a post type:
 * drops entries whose key no longer exists (e.g. a meta field specific to a
 * previously selected post type), falling back to `defaultValue` (itself
 * filtered the same way) if that empties the selection.
 *
 * Shared by both attributes rather than duplicated per-panel, since "drop
 * what's no longer valid when the post type changes" is identical logic
 * for columns and facets -- only what counts as a sensible empty-state
 * default differs (columns falls back to ID/Title; facets is fine empty).
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
