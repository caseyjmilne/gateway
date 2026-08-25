/**
 * "Compare" select control for the facet block's "Input" UI type: how the
 * *live* filter matches as a visitor types.
 *
 * Deliberately just two options -- DataTables' client-side column search
 * has no built-in numeric/date comparison operators (">", ">=", etc.), only
 * substring or regex matching, so that's what these two map onto directly
 * rather than promising a broader vocabulary the front end can't back up.
 * Only relevant for "Input": Select/Checkboxes are always exact matches
 * against a fixed list of values, so this control isn't shown for those
 * (see edit.js).
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
