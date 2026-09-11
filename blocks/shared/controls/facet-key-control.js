/**
 * "Facet" select control: which of the parent block's configured facets
 * (block context, not a fetch of its own) this control represents --
 * gateway/card-facet's own "pick one of the parent's configured facets"
 * picker against gateway/data-cards' own `facets` context.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * @param {Object}   props
 * @param {Object[]} props.facets      Parent's configured facets: [{ key, compare, value }].
 * @param {Object}   props.labelsByKey Map of key => friendly label.
 * @param {string}   props.value       Selected facet key.
 * @param {Function} props.onChange    ( key ) => void.
 */
export default function FacetKeyControl( { facets, labelsByKey, value, onChange } ) {
	const options = [
		{ label: __( '— Select a facet —', 'gateway' ), value: '' },
		...facets.map( ( facet ) => ( {
			label: labelsByKey[ facet.key ] || facet.key,
			value: facet.key,
		} ) ),
	];

	return (
		<SelectControl
			label={ __( 'Facet', 'gateway' ) }
			help={ __(
				'Which of the block’s configured facets this control filters.',
				'gateway'
			) }
			value={ value }
			options={ options }
			onChange={ onChange }
		/>
	);
}
