import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

/**
 * The one `@dnd-kit` sensor configuration every drag-and-drop-reorderable
 * list in this admin app shares (RecordsCrud's own Position-sorted table,
 * FieldEditor's own Fields list) -- a small `distance` activation
 * constraint, so a plain click on the drag-handle button (which reads,
 * to the browser, as pointerdown-then-pointerup-with-no-movement) never
 * gets mistaken for the start of a drag; 4px matches dnd-kit's own
 * commonly-recommended default for exactly this reason.
 */
export default function useReorderSensors() {
	return useSensors(
		useSensor( PointerSensor, { activationConstraint: { distance: 4 } } )
	);
}
