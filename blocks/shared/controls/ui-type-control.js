/**
 * "UI Type" select control: which control renders on the front end for
 * this facet. Supported types: input, select, checkboxes.
 *
 * Originally lived under blocks/facet/src/controls/ as gateway/facet's
 * own control; moved here once gateway/card-facet needed the same
 * picker. Gained `allowedTypes` at the same time: gateway/card-facet
 * trims this to the selected field's own `facetType` (from
 * Column_Registry -- a Select of every distinct `post_content` value, or
 * a taxonomy's nonexistent free-text compare mode, aren't real choices),
 * while gateway/facet's own usage passes nothing and keeps offering all
 * three, unchanged.
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
 * @param {string}   props.value          Selected UI type.
 * @param {Function} props.onChange       ( uiType ) => void.
 * @param {string[]} [props.allowedTypes] Subset of 'input'/'select'/'checkboxes' to offer. Defaults to all three.
 */
export default function UiTypeControl( { value, onChange, allowedTypes } ) {
	const options = allowedTypes
		? UI_TYPE_OPTIONS.filter( ( option ) => allowedTypes.includes( option.value ) )
		: UI_TYPE_OPTIONS;

	return (
		<SelectControl
			label={ __( 'UI Type', 'gateway' ) }
			value={ value }
			options={ options }
			onChange={ onChange }
		/>
	);
}
