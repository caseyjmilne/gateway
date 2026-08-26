/**
 * "Compare" select control for a facet block's "Input" UI type: how the
 * *live* filter matches as a visitor types.
 *
 * Deliberately just two options -- neither DataTables' client-side column
 * search (gateway/facet) nor gateway/data-cards' REST-fetch filtering
 * (gateway/card-facet) implements numeric/date comparison operators
 * (">", ">=", etc.), only substring or exact matching, so that's what
 * these two map onto directly rather than promising a broader vocabulary
 * neither front end can back up. Only relevant for "Input": Select/
 * Checkboxes are always exact matches against a fixed list of values, so
 * this control isn't shown for those (see each block's own edit.js).
 *
 * Originally lived under blocks/facet/src/controls/ as gateway/facet's
 * own control; moved here once gateway/card-facet needed the same one.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export const COMPARE_OPTIONS = [
	{ label: __( 'Contains', 'gateway' ), value: 'contains' },
	{ label: __( 'Equals', 'gateway' ), value: 'equals' },
];

/**
 * @param {Object}   props
 * @param {string}   props.value    Selected compare mode.
 * @param {Function} props.onChange ( compare ) => void.
 */
export default function CompareControl( { value, onChange } ) {
	return (
		<SelectControl
			label={ __( 'Compare', 'gateway' ) }
			help={ __(
				'How the live filter matches as a visitor types, here on the front end -- separate from the preset match configured on the Data Table block’s Facets panel.',
				'gateway'
			) }
			value={ value }
			options={ COMPARE_OPTIONS }
			onChange={ onChange }
		/>
	);
}
