import { useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import useReorderSensors from '../hooks/useReorderSensors.js';
import useSortableRow from '../hooks/useSortableRow.js';
import DndSortableGroup from './DndSortableGroup.jsx';

/**
 * A small orderable list editor for a Choice_Field_Type field's own
 * choices (Buttons/Select/Radio/Checkbox) -- one `{value, label}` pair
 * per row (two text inputs), a "⠿" handle to drag-reorder it, "Remove"
 * to delete one, "Add Choice" to append a new blank one. `@dnd-kit`
 * (`useSortableRow()`/`DndSortableGroup()`, shared with RecordsCrud's
 * own Position-sorted table and FieldEditor's own Fields list) rather
 * than the plain native HTML5 drag-and-drop this used to use -- that
 * version only ever moved the "⠿" icon itself during a drag, with no
 * other row visibly shifting to make room; see `useSortableRow()`'s own
 * docblock for the full reasoning.
 *
 * `handleProps` (the actual pointer-capture that starts a drag) is
 * spread onto the "⠿" handle SPAN itself, not the row -- reported
 * directly, back when this used native drag-and-drop: "only the drag
 * icon should be draggable. Having entire row draggable is interfering
 * with editing inside the inputs" (a `draggable="true"` ancestor used to
 * intercept the browser's own native text-selection/cursor-drag inside a
 * plain `<input>`). `@dnd-kit`'s own pointer-based dragging never sets a
 * native `draggable` attribute anywhere in the first place, so that
 * exact failure mode can't recur -- the handle-only scoping is kept
 * anyway, the same "a click on Remove/an input must never accidentally
 * start a drag" reasoning `useSortableRow()`'s other callers already
 * have.
 *
 * `value` is what's actually stored/returned/compared when the field is
 * used elsewhere (`Choice_Field_Type::cast()` only ever sees this half);
 * `label` is a purely cosmetic override of how it's shown -- in this
 * form's own Select/Radio/Buttons/Checkbox controls, and in the Records
 * list's own display of an already-saved value -- falling back to
 * `value` when left blank (`Gateway\\Model_Fields::require_choices_for_field()`
 * is what actually applies that fallback on save; a still-blank Label
 * shown here while editing is not itself an error). Value comes first in
 * each row, same order Name comes before Label at the field level
 * itself (`FieldEditor`'s own General tab) -- the technical identity is
 * typed first, the display override second and optional.
 *
 * A blank Value is tolerated here while editing (the site owner is
 * mid-typing a new choice, or cleared one out) -- `require_choices_for_field()`
 * on the server is what actually drops blanks/rejects an empty-after
 * -trimming list on save, the same "server validates, this is just the
 * editing surface" split every other field input already has (e.g. a
 * blank Name is likewise only rejected server-side, not pre-validated
 * here).
 *
 * Controlled: `choices` (an array of `{value, label}` objects, in order)
 * and `onChange` (receiving the whole new array) are owned by the caller
 * (FieldEditor, once for its own field-being-added/edited state). This
 * component holds one small piece of state of its own beyond that,
 * though -- `choiceIds` -- purely because `@dnd-kit` needs a real, STABLE
 * id per row to track a drag by, and `{value, label}` alone has no such
 * thing (either half is free to repeat, or sit blank mid-edit). Seeded
 * once per mount (this component remounts fresh every time FieldEditor
 * switches which field's own panel is open -- see that component's own
 * docblock on `rowKey` -- so there's no stale-id risk carried over from a
 * DIFFERENT field's own choices) and kept in lockstep with `choices` by
 * every mutation THIS component itself makes (add/remove/reorder) --
 * never touched by a plain Value/Label edit, which changes `choices`'
 * own CONTENT but never its length or order.
 */
export default function ChoicesEditor( { choices, onChange } ) {
	const dragSensors = useReorderSensors();
	const nextIdRef = useRef( 0 );
	const generateId = () => `choice-${ nextIdRef.current++ }`;

	const [ choiceIds, setChoiceIds ] = useState( () =>
		choices.map( () => generateId() )
	);

	const updateChoice = ( index, key, value ) => {
		const next = [ ...choices ];
		next[ index ] = { ...next[ index ], [ key ]: value };
		onChange( next );
	};

	const removeChoice = ( index ) => {
		onChange( choices.filter( ( _choice, i ) => i !== index ) );
		setChoiceIds( ( ids ) => ids.filter( ( _id, i ) => i !== index ) );
	};

	const addChoice = () => {
		onChange( [ ...choices, { value: '', label: '' } ] );
		setChoiceIds( ( ids ) => [ ...ids, generateId() ] );
	};

	const handleDragEnd = ( event ) => {
		const { active, over } = event;

		if ( ! over || active.id === over.id ) {
			return;
		}

		const fromIndex = choiceIds.indexOf( active.id );
		const toIndex = choiceIds.indexOf( over.id );

		if ( -1 === fromIndex || -1 === toIndex ) {
			return;
		}

		onChange( arrayMove( choices, fromIndex, toIndex ) );
		setChoiceIds( ( ids ) => arrayMove( ids, fromIndex, toIndex ) );
	};

	return (
		<div className="gateway-choices-editor">
			<DndSortableGroup
				enabled
				sensors={ dragSensors }
				onDragEnd={ handleDragEnd }
				itemIds={ choiceIds }
			>
				<>
					{ choices.map( ( choice, index ) => (
						<SortableChoiceRow
							key={ choiceIds[ index ] }
							id={ choiceIds[ index ] }
						>
							{ ( handleProps ) => (
								<>
									<span
										className="gateway-choices-editor-drag-col"
										title="Drag to reorder"
										{ ...handleProps }
									>
										⠿
									</span>
									<input
										type="text"
										className="regular-text"
										placeholder={ `Value ${ index + 1 }` }
										aria-label={ `Choice ${ index + 1 } value` }
										value={ choice.value }
										onChange={ ( event ) =>
											updateChoice( index, 'value', event.target.value )
										}
									/>
									<input
										type="text"
										className="regular-text"
										placeholder="Label (optional)"
										aria-label={ `Choice ${ index + 1 } label` }
										value={ choice.label }
										onChange={ ( event ) =>
											updateChoice( index, 'label', event.target.value )
										}
									/>
									<button
										type="button"
										className="button"
										onClick={ () => removeChoice( index ) }
									>
										Remove
									</button>
								</>
							) }
						</SortableChoiceRow>
					) ) }
				</>
			</DndSortableGroup>
			<button type="button" className="button" onClick={ addChoice }>
				Add Choice
			</button>
			{ 0 === choices.filter( ( choice ) => choice.value.trim() ).length && (
				<p className="description">Add at least one choice.</p>
			) }
		</div>
	);
}

/**
 * One draggable choice row. `useSortableRow()` (shared with RecordsCrud's
 * own Position-sorted table and FieldEditor's own Fields list) does the
 * actual `@dnd-kit/sortable` wiring -- see that hook's own docblock for
 * why the "⠿" handle only ever receives `handleProps` while the whole
 * row (a `<div>` here, not a `<tr>` -- this list was never a `<table>`)
 * carries `setNodeRef`/`style`. `children` is a render prop (a function)
 * so the row's own cells -- built once, above -- can receive that real
 * `handleProps`.
 */
function SortableChoiceRow( { id, children } ) {
	const { setNodeRef, style, handleProps } = useSortableRow( id );

	return (
		<div ref={ setNodeRef } style={ style } className="gateway-choices-editor-row">
			{ children( handleProps ) }
		</div>
	);
}
