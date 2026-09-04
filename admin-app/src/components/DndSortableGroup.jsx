import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

/**
 * Wraps a list of sortable rows in `@dnd-kit`'s `DndContext`/
 * `SortableContext` only while `enabled` is on. `enabled` false renders
 * `children` completely unwrapped -- no `DndContext` at all, not even an
 * inert one, when nothing on the page would use it (e.g. RecordsCrud's
 * own table while sorted by something other than Position, or
 * FieldEditor's own Fields list while a row is open for editing).
 *
 * When the rows being wrapped are `<tr>`s, wrap the WHOLE `<table>` in
 * this (not just its `<tbody>`): `DndContext` renders its own extra
 * accessibility-announcement `<div>`s as siblings of whatever it wraps,
 * which is invalid, `validateDOMNesting`-warning markup when that
 * "whatever" is itself already inside a `<table>` (a `<div>` is never a
 * legal direct child of `<table>` -- only `<thead>`/`<tbody>`/`<tfoot>`/
 * `<caption>`/`<colgroup>` are). Wrapping the whole `<table>` instead
 * means those divs land as harmless siblings after `</table>`. A plain
 * `<div>`-based list (ChoicesEditor's own choice rows) has no such
 * constraint -- wrap however's convenient there.
 *
 * Shared by every draggable list in this admin app (RecordsCrud's own
 * Position-sorted records table, FieldEditor's own Fields list,
 * ChoicesEditor's own choice rows, ColumnsEditor's own column rows) --
 * paired with the `useSortableRow()` hook for each individual row's own
 * wiring.
 *
 * @param {Object}                 props
 * @param {boolean}                props.enabled  Whether dragging is
 *                                    currently possible at all.
 * @param {Object}                 props.sensors  From `useReorderSensors()`.
 * @param {Function}               props.onDragEnd `DndContext`'s own
 *                                    `onDragEnd` handler.
 * @param {Array<string|number>}   props.itemIds  Every row's own sortable
 *                                    id, in their CURRENT order.
 * @param {import('react').ReactNode} props.children The list itself
 *                                    (a `<table>`, or any other wrapper
 *                                    around the sortable rows).
 */
export default function DndSortableGroup( { enabled, sensors, onDragEnd, itemIds, children } ) {
	if ( ! enabled ) {
		return children;
	}

	return (
		<DndContext
			sensors={ sensors }
			collisionDetection={ closestCenter }
			onDragEnd={ onDragEnd }
		>
			<SortableContext items={ itemIds } strategy={ verticalListSortingStrategy }>
				{ children }
			</SortableContext>
		</DndContext>
	);
}
