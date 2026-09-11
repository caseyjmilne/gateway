/**
 * "Compare" select control for gateway/card-facet's "Input" UI type: how
 * the *live* filter matches as a visitor types.
 *
 * Offers the exact same operator vocabulary (and values -- '=', '!=',
 * '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE') as the top-level Facets
 * panel's own Default-value modal (FACET_COMPARE_OPTIONS) -- both are
 * ultimately validated/applied by the same Facet_Query::ALLOWED_COMPARE
 * allow-list and apply_facets()/apply_collection_facets() on the PHP
 * side, so there's no reason for the *live* control to offer a narrower
 * choice than the *default* one already does; a Number/Range field's
 * facet (e.g. "Estimated Hours > 2") needs exactly this vocabulary.
 * Only relevant for "Input": Select/Checkboxes are always exact matches
 * against a fixed list of values, so this control isn't shown for those
 * (see gateway/card-facet's own edit.js).
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { FACET_COMPARE_OPTIONS } from './facet-compare-options';

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
				'How the live filter matches as a visitor interacts with it, here on the front end -- separate from the preset match configured on the parent block’s Facets panel.',
				'gateway'
			) }
			value={ value }
			options={ FACET_COMPARE_OPTIONS }
			onChange={ onChange }
		/>
	);
}
