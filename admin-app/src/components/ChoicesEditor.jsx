import { useState } from 'react';

/**
 * A small orderable list editor for a Choice_Field_Type field's own
 * choices (Buttons/Select/Radio/Checkbox) -- one text input per choice,
 * a "⠿" handle to drag-reorder it, "Remove" to delete one, "Add Choice"
 * to append a new blank one. Native HTML5 drag-and-drop, the same
 * mechanism (and the same drag-handle convention) FieldEditor's own
 * fields table already uses to reorder fields -- one drag pattern this
 * app expects an orderable list to use, not a second, different one.
 *
 * A blank entry is tolerated here while editing (the site owner is
 * mid-typing a new choice, or cleared one out) -- Gateway\\Model_Fields::
 * require_choices_for_field() on the server is what actually drops
 * blanks/rejects an empty-after-trimming list on save, the same
 * "server validates, this is just the editing surface" split every other
 * field input already has (e.g. a blank Name is likewise only rejected
 * server-side, not pre-validated here).
 *
 * Controlled: `choices` (a plain string array, in order) and `onChange`
 * (receiving the whole new array) are owned by the caller (FieldEditor,
 * once for its own field-being-added/edited state) -- this component
 * holds no state of its own beyond which row is mid-drag, the same
 * "lifted state" shape the rest of FieldEditor's own fields list already
 * uses.
 */
export default function ChoicesEditor( { choices, onChange } ) {
	const [ draggedIndex, setDraggedIndex ] = useState( null );

	const updateChoice = ( index, value ) => {
		const next = [ ...choices ];
		next[ index ] = value;
		onChange( next );
	};

	const removeChoice = ( index ) => {
		onChange( choices.filter( ( _choice, i ) => i !== index ) );
	};

	const addChoice = () => onChange( [ ...choices, '' ] );

	const handleDragStart = ( index ) => ( event ) => {
		setDraggedIndex( index );
		event.dataTransfer.effectAllowed = 'move';
	};

	const handleDragOver = ( event ) => {
		// A drop target must cancel dragover for onDrop to ever fire --
		// standard (if easy to forget) HTML5 drag-and-drop requirement.
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	};

	const handleDrop = ( targetIndex ) => ( event ) => {
		event.preventDefault();

		const fromIndex = draggedIndex;
		setDraggedIndex( null );

		if ( null === fromIndex || fromIndex === targetIndex ) {
			return;
		}

		const next = [ ...choices ];
		const [ moved ] = next.splice( fromIndex, 1 );
		next.splice( targetIndex, 0, moved );
		onChange( next );
	};

	return (
		<div className="gateway-choices-editor">
			{ choices.map( ( choice, index ) => (
				<div
					className={
						'gateway-choices-editor-row' +
						( draggedIndex === index
							? ' gateway-choices-editor-row-dragging'
							: '' )
					}
					// eslint-disable-next-line react/no-array-index-key -- choices have no other stable identity; reordering is handled via onChange above, not by React tracking this key across renders.
					key={ index }
					draggable
					onDragStart={ handleDragStart( index ) }
					onDragOver={ handleDragOver }
					onDrop={ handleDrop( index ) }
				>
					<span
						className="gateway-choices-editor-drag-col"
						title="Drag to reorder"
					>
						⠿
					</span>
					<input
						type="text"
						className="regular-text"
						placeholder={ `Choice ${ index + 1 }` }
						value={ choice }
						onChange={ ( event ) =>
							updateChoice( index, event.target.value )
						}
					/>
					<button
						type="button"
						className="button"
						onClick={ () => removeChoice( index ) }
					>
						Remove
					</button>
				</div>
			) ) }
			<button type="button" className="button" onClick={ addChoice }>
				Add Choice
			</button>
			{ 0 === choices.filter( ( choice ) => choice.trim() ).length && (
				<p className="description">Add at least one choice.</p>
			) }
		</div>
	);
}
