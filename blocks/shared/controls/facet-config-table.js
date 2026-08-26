/**
 * Selected-facets configuration table: drag-and-drop to reorder, plus a
 * "Default" button opening a modal for each facet's Compare operator and
 * Value.
 *
 * Compare and Value used to be their own inline `<select>`/`<input>`
 * columns here -- reasonable for two short controls, but "Equals"/"Not
 * Equals"/etc. plus a free-text value made for a wide row that, combined
 * with the Field column and the handle/remove columns either side, forced
 * horizontal scrolling in the (comparatively narrow) Inspector sidebar.
 * One "Default" button per row, opening a `<Modal>` with both controls
 * given real room, fixes the width without losing anything -- the row
 * itself stays narrow regardless of how long a Compare label or Value
 * gets.
 *
 * Structurally the same as column-config-table.js (drag-and-drop reorder +
 * remove) otherwise -- kept as a separate component rather than a shared
 * one with conditional rendering, since the two tables' per-row controls
 * are different enough (and likely to keep diverging) that sharing would
 * mean more branching than reuse.
 */

import { useState } from '@wordpress/element';
import { Button, Modal, SelectControl, TextControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import classnames from '../classnames';
import { FACET_COMPARE_OPTIONS } from './facet-compare-options';

// Term membership is inherently binary -- the rest of FACET_COMPARE_OPTIONS
// (">", "LIKE", ...) has no coherent meaning for a taxonomy facet, and
// Facet_Query::apply_facets() only ever reads one of these two for a
// taxonomy anyway (anything else silently becomes "Equals" server-side).
const TAXONOMY_COMPARE_OPTIONS = FACET_COMPARE_OPTIONS.slice( 0, 2 );

/**
 * @param {Object}   props
 * @param {Object[]} props.facets       Selected facets, in order: [{ key, compare, value }].
 * @param {Object}   props.columnsByKey Map of key => column definition ({ key, label, type }).
 * @param {Function} props.onChange     ( nextFacets ) => void, for reorder/compare/value changes.
 * @param {Function} props.onRemove     ( key ) => void -- removes a facet from the selection.
 */
export default function FacetConfigTable( {
	facets,
	columnsByKey,
	onChange,
	onRemove,
} ) {
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );
	// The key of the facet whose Default modal is currently open, if any --
	// a key rather than an index, since it needs to keep pointing at the
	// same facet even if `facets` reorders while the modal is open.
	const [ editingKey, setEditingKey ] = useState( null );

	if ( ! facets.length ) {
		return (
			<p className="gateway-columns-config__empty">
				{ __(
					'Select a field above to filter the grid by.',
					'gateway'
				) }
			</p>
		);
	}

	const moveFacet = ( fromIndex, toIndex ) => {
		if ( fromIndex === toIndex || fromIndex === null || toIndex === null ) {
			return;
		}

		const next = facets.slice();
		const [ moved ] = next.splice( fromIndex, 1 );
		next.splice( toIndex, 0, moved );
		onChange( next );
	};

	const updateFacet = ( key, changes ) => {
		const next = facets.map( ( facet ) =>
			facet.key === key ? { ...facet, ...changes } : facet
		);
		onChange( next );
	};

	const editingFacet = facets.find( ( facet ) => facet.key === editingKey );
	const editingColumn = editingFacet && columnsByKey[ editingFacet.key ];
	const editingCompareOptions =
		editingColumn && 'taxonomy' === editingColumn.type
			? TAXONOMY_COMPARE_OPTIONS
			: FACET_COMPARE_OPTIONS;

	return (
		<>
			<table className="gateway-columns-config gateway-facets-config">
				<thead>
					<tr>
						<th className="gateway-columns-config__handle-col"></th>
						<th>{ __( 'Field', 'gateway' ) }</th>
						<th>{ __( 'Default', 'gateway' ) }</th>
						<th className="gateway-columns-config__remove-col"></th>
					</tr>
				</thead>
				<tbody>
					{ facets.map( ( facet, index ) => {
						const column = columnsByKey[ facet.key ];

						return (
							<tr
								key={ facet.key }
								className={ classnames(
									'gateway-columns-config__row',
									dragIndex === index && 'is-dragging',
									overIndex === index &&
										dragIndex !== index &&
										'is-drop-target'
								) }
								onDragOver={ ( event ) => {
									event.preventDefault();
									setOverIndex( index );
								} }
								onDrop={ ( event ) => {
									event.preventDefault();
									moveFacet( dragIndex, index );
									setDragIndex( null );
									setOverIndex( null );
								} }
								onDragEnd={ () => {
									setDragIndex( null );
									setOverIndex( null );
								} }
							>
								{ /* draggable lives on the handle, not the row, so a drag can
							   only be started from here -- not from the Default button
							   elsewhere in the row. */ }
								<td
									className="gateway-columns-config__handle"
									aria-hidden="true"
									draggable
									onDragStart={ ( event ) => {
										setDragIndex( index );
										event.dataTransfer.effectAllowed = 'move';
										event.dataTransfer.setData(
											'text/plain',
											String( index )
										);
									} }
								>
									⠿
								</td>
								<td>{ ( column && column.label ) || facet.key }</td>
								<td>
									<Button
										variant="secondary"
										size="small"
										isPressed={ '' !== facet.value }
										onClick={ () => setEditingKey( facet.key ) }
									>
										{ __( 'Default', 'gateway' ) }
									</Button>
								</td>
								<td>
									<Button
										className="gateway-columns-config__remove"
										icon="no-alt"
										label={ __( 'Remove facet', 'gateway' ) }
										size="small"
										isDestructive
										onClick={ () => onRemove( facet.key ) }
									/>
								</td>
							</tr>
						);
					} ) }
				</tbody>
			</table>
			{ editingFacet && (
				<Modal
					title={ sprintf(
						/* translators: %s: field label. */
						__( 'Default value for “%s”', 'gateway' ),
						( editingColumn && editingColumn.label ) || editingFacet.key
					) }
					onRequestClose={ () => setEditingKey( null ) }
					className="gateway-facet-default-modal"
				>
					<SelectControl
						__nextHasNoMarginBottom
						label={ __( 'Compare', 'gateway' ) }
						value={ editingFacet.compare }
						options={ editingCompareOptions }
						onChange={ ( compare ) =>
							updateFacet( editingFacet.key, { compare } )
						}
					/>
					<TextControl
						__nextHasNoMarginBottom
						label={ __( 'Value', 'gateway' ) }
						value={ editingFacet.value }
						onChange={ ( value ) =>
							updateFacet( editingFacet.key, { value } )
						}
					/>
					<Button
						variant="primary"
						onClick={ () => setEditingKey( null ) }
					>
						{ __( 'Done', 'gateway' ) }
					</Button>
				</Modal>
			) }
		</>
	);
}
