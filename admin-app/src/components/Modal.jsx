import { useEffect } from 'react';

/**
 * A small, generic overlay dialog -- RecordsCrud's own Edit form used to
 * grow inline as a second `<tr>` under the row being edited (the same
 * "the row never disappears, the panel opens right underneath it"
 * pattern FieldEditor's own Fields table still uses), but for a record
 * with many fields that made the whole records table grow and reflow
 * underneath it, pushing every row below the one being edited further
 * down the page with every field the form itself needed room for. A
 * modal floating above the list, independent of the table's own layout,
 * doesn't have that problem -- the list stays exactly where it is
 * underneath, whatever the length of the form inside.
 *
 * Deliberately hand-rolled rather than a library (`@wordpress/components`'
 * own `Modal`, say) -- this app is plain React + Vite, kept separate from
 * the Gutenberg blocks' own `@wordpress/scripts` build (see this app's
 * own README), so pulling in a Gutenberg-only dependency here would be
 * an odd fit for one small dialog. No focus trap -- this is an
 * admin-only screen behind a page a site owner already has to be logged
 * in to reach, not a public-facing accessibility surface with the same
 * stakes a plugin's own front-end widgets would have.
 *
 * `onClose` fires on three equivalent "back out" gestures: the ×
 * button, clicking the dimmed overlay outside the panel, and Escape --
 * the caller decides what that actually means (RecordsCrud wires it to
 * the same handler its own Cancel button already used).
 */
export default function Modal( { title, onClose, children } ) {
	useEffect( () => {
		const handleKeyDown = ( event ) => {
			if ( 'Escape' === event.key ) {
				onClose();
			}
		};

		document.addEventListener( 'keydown', handleKeyDown );
		return () => document.removeEventListener( 'keydown', handleKeyDown );
	}, [ onClose ] );

	return (
		<div
			className="gateway-modal-overlay"
			onClick={ ( event ) => {
				if ( event.target === event.currentTarget ) {
					onClose();
				}
			} }
		>
			<div className="gateway-modal" role="dialog" aria-modal="true" aria-label={ title }>
				<div className="gateway-modal-header">
					<h2>{ title }</h2>
					<button
						type="button"
						className="gateway-modal-close"
						onClick={ onClose }
						aria-label="Close"
					>
						×
					</button>
				</div>
				<div className="gateway-modal-body">{ children }</div>
			</div>
		</div>
	);
}
