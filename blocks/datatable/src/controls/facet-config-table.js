/**
 * Selected-facets configuration table: drag-and-drop to reorder, plus a
 * Compare operator and Value for each facet.
 *
 * Structurally the same as column-config-table.js (drag-and-drop reorder +
 * remove), swapping the "Sortable" toggle for a Compare <select> and a
 * Value <input> -- kept as a separate component rather than a shared one
 * with conditional rendering, since the two tables' per-row controls are
 * different enough (and likely to keep diverging) that sharing would mean
 * more branching than reuse.
 */

import { useState } from '@wordpress/element';
import { Button, SelectControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import classnames from '../utils/classnames';
import { FACET_COMPARE_OPTIONS } from './facet-compare-options';

/**
 * @param {Object}   props
 * @param {Object[]} props.facets      Selected facets, in order: [{ key, compare, value }].
 * @param {Object}   props.labelsByKey Map of key => friendly label, for display.
 * @param {Function} props.onChange    ( nextFacets ) => void, for reorder/compare/value changes.
 * @param {Function} props.onRemove    ( key ) => void -- removes a facet from the selection.
 */
export default function FacetConfigTable( { facets, labelsByKey, onChange, onRemove } ) {
	const [ dragIndex, setDragIndex ] = useState( null );
	const [ overIndex, setOverIndex ] = useState( null );

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

	const updateFacet = ( index, changes ) => {
		const next = facets.map( ( facet, i ) =>
			i === index ? { ...facet, ...changes } : facet
		);
		onChange( next );
	};

	return (
		<table className="gateway-columns-config gateway-facets-config">
			<thead>
				<tr>
					<th className="gateway-columns-config__handle-col"></th>
					<th>{ __( 'Field', 'gateway' ) }</th>
					<th>{ __( 'Compare', 'gateway' ) }</th>
					<th>{ __( 'Value', 'gateway' ) }</th>
					<th className="gateway-columns-config__remove-col"></th>
				</tr>
			</thead>
			<tbody>
				{ facets.map( ( facet, index ) => (
					<tr
						key={ facet.key }
						className={ classnames(
							'gateway-columns-config__row',
							dragIndex === index && 'is-dragging',
							overIndex === index && dragIndex !== index && 'is-drop-target'
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
						   only be started from here -- not from the Compare/Value
						   controls elsewhere in the row. */ }
						<td
							className="gateway-columns-config__handle"
							aria-hidden="true"
							draggable
							onDragStart={ ( event ) => {
								setDragIndex( index );
								event.dataTransfer.effectAllowed = 'move';
								event.dataTransfer.setData( 'text/plain', String( index ) );
							} }
						>
							⠿
						</td>
						<td>{ labelsByKey[ facet.key ] || facet.key }</td>
						<td>
							<SelectControl
								__nextHasNoMarginBottom
								label={ __( 'Compare', 'gateway' ) }
								hideLabelFromVision
								value={ facet.compare }
								options={ FACET_COMPARE_OPTIONS }
								onChange={ ( compare ) => updateFacet( index, { compare } ) }
							/>
						</td>
						<td>
							<TextControl
								__nextHasNoMarginBottom
								label={ __( 'Value', 'gateway' ) }
								hideLabelFromVision
								value={ facet.value }
								onChange={ ( value ) => updateFacet( index, { value } ) }
							/>
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
				) ) }
			</tbody>
		</table>
	);
}
