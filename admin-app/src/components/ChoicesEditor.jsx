/**
 * A small orderable list editor for a Choice_Field_Type field's own
 * choices (Buttons/Select/Radio/Checkbox) -- one text input per choice,
 * "↑"/"↓" to reorder, "Remove" to delete one, "Add Choice" to append a
 * new blank one. Plain up/down buttons rather than the drag-and-drop
 * FieldEditor's own fields table uses to reorder fields -- this list is
 * nested inside a single field row already being edited, where a full
 * HTML5 drag interaction has much less room to work with, and much less
 * to gain over two buttons, for what's typically a short list.
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
 * once for its "Add Field" form, once for whichever row is being edited)
 * -- this component holds no state of its own, the same "lifted state"
 * shape the rest of FieldEditor's own fields list already uses.
 */
export default function ChoicesEditor( { choices, onChange } ) {
	const updateChoice = ( index, value ) => {
		const next = [ ...choices ];
		next[ index ] = value;
		onChange( next );
	};

	const removeChoice = ( index ) => {
		onChange( choices.filter( ( _choice, i ) => i !== index ) );
	};

	const moveChoice = ( index, direction ) => {
		const target = index + direction;

		if ( target < 0 || target >= choices.length ) {
			return;
		}

		const next = [ ...choices ];
		const moved = next[ index ];
		next[ index ] = next[ target ];
		next[ target ] = moved;
		onChange( next );
	};

	const addChoice = () => onChange( [ ...choices, '' ] );

	return (
		<div className="gateway-choices-editor">
			{ choices.map( ( choice, index ) => (
				<div
					className="gateway-choices-editor-row"
					// eslint-disable-next-line react/no-array-index-key -- choices have no other stable identity, and this list is never filtered/sorted independently of user-driven index changes handled via onChange above.
					key={ index }
				>
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
						onClick={ () => moveChoice( index, -1 ) }
						disabled={ 0 === index }
						aria-label="Move choice up"
						title="Move up"
					>
						↑
					</button>
					<button
						type="button"
						className="button"
						onClick={ () => moveChoice( index, 1 ) }
						disabled={ index === choices.length - 1 }
						aria-label="Move choice down"
						title="Move down"
					>
						↓
					</button>
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
				<p className="description">
					Add at least one choice.
				</p>
			) }
		</div>
	);
}
