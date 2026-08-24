/**
 * "UI Type" select control: which control renders on the front end for
 * this facet. Supported types for now: input, select, checkboxes.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export const UI_TYPE_OPTIONS = [
	{ label: __( 'Input', 'gateway' ), value: 'input' },
	{ label: __( 'Select', 'gateway' ), value: 'select' },
	{ label: __( 'Checkboxes', 'gateway' ), value: 'checkboxes' },
];

/**
 * @param {Object}   props
 * @param {string}   props.value    Selected UI type.
 * @param {Function} props.onChange ( uiType ) => void.
 */
export default function UiTypeControl( { value, onChange } ) {
	return (
		<SelectControl
			label={ __( 'UI Type', 'gateway' ) }
			value={ value }
			options={ UI_TYPE_OPTIONS }
			onChange={ onChange }
		/>
	);
}
