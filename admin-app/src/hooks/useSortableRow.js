import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * The `@dnd-kit/sortable` wiring shared by every draggable row/list-item
 * in this admin app (RecordsCrud's own Position-sorted table,
 * FieldEditor's own Fields list, ChoicesEditor's own choice rows,
 * ColumnsEditor's own column rows) -- built specifically to fix the two
 * concrete complaints those lists' own PREVIOUS native-HTML5-drag-and-drop
 * implementations had:
 *
 * 1. "The dragged item is just the draggable icon, when it should be the
 *    full row." `handleProps` (`attributes` + `listeners`, the actual
 *    pointer-capture that starts a drag) is meant to be spread onto a
 *    small handle element only -- clicking anywhere else in the row (an
 *    action button, an input, the row's own open/close click) must never
 *    accidentally start a drag -- but `setNodeRef`/`style` (what actually
 *    MOVES during a drag) belong on the row's own outermost element
 *    (typically a `<tr>`), not the handle alone. The handle is only ever
 *    the grab TARGET; what visibly lifts and follows the cursor is the
 *    row's own real, complete content.
 * 2. "The items don't move [and other rows don't shift]." `transform`/
 *    `transition` come straight from `useSortable()`, which recalculates
 *    every OTHER row's own offset live as a drag crosses it -- these two
 *    lists' own previous implementations had no such thing at all.
 *
 * `style` already bakes in the "float above your striped neighbors while
 * dragging" treatment both call sites want (a raised `zIndex`/opaque
 * background/shadow) -- no `DragOverlay` needed for either: both are a
 * single same-table, same-container sort (DragOverlay exists mainly for
 * cross-container drags, or to escape a clipping/overflow ancestor,
 * neither of which applies here), so the real row itself lifting and
 * moving via its own `transform` -- staying inside its real `<table>`
 * the whole time -- is simpler and never needs separately replicating
 * column widths the way an overlaid clone rendered outside the table
 * would.
 *
 * @param {string|number} id This row's own sortable id -- must match
 *                            one of the entries in the enclosing
 *                            `DndSortableGroup`'s own `itemIds`.
 * @return {{setNodeRef: Function, style: Object, isDragging: boolean, handleProps: Object}}
 */
export default function useSortableRow( id ) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable( { id } );

	const style = {
		transform: CSS.Transform.toString( transform ),
		transition,
		position: 'relative',
		zIndex: isDragging ? 1 : undefined,
		background: isDragging ? '#fff' : undefined,
		boxShadow: isDragging ? '0 2px 10px rgba(0, 0, 0, 0.18)' : undefined,
	};

	return {
		setNodeRef,
		style,
		isDragging,
		handleProps: { ...attributes, ...listeners },
	};
}
