import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

/**
 * Wraps a `<table>` in `@dnd-kit`'s `DndContext`/`SortableContext` only
 * while `enabled` is on -- OUTSIDE the `<table>` element entirely, not
 * between `<thead>` and `<tbody>`: `DndContext` renders its own extra
 * accessibility-announcement `<div>`s as siblings of whatever it wraps,
 * which is invalid, `validateDOMNesting`-warning markup when that
 * "whatever" is itself already inside a `<table>` (a `<div>` is never a
 * legal direct child of `<table>` -- only `<thead>`/`<tbody>`/`<tfoot>`/
 * `<caption>`/`<colgroup>` are). Wrapping the WHOLE `<table>` instead
 * means those divs land as harmless siblings after `</table>`.
 *
 * `enabled` false renders `children` completely unwrapped -- no
 * `DndContext` at all, not even an inert one, when nothing on the page
 * would use it (e.g. RecordsCrud's own table while sorted by something
 * other than Position, or FieldEditor's own Fields list while a row is
 * open for editing).
 *
 * Shared by every draggable table in this admin app (RecordsCrud's own
 * Position-sorted records table, FieldEditor's own Fields list) --
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
 * @param {import('react').ReactNode} props.children The `<table>` itself.
 */
export default function DndTableBody( { enabled, sensors, onDragEnd, itemIds, children } ) {
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
