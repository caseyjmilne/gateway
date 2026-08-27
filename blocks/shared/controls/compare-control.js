/**
 * "Compare" select control for a facet block's "Input" UI type: how the
 * *live* filter matches as a visitor types.
 *
 * Defaults to the exact same operator vocabulary (and values -- '=',
 * '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE') as the top-level Facets
 * panel's own Default-value modal (FACET_COMPARE_OPTIONS) -- both are
 * ultimately validated/applied by the same Facet_Query::ALLOWED_COMPARE
 * allow-list and apply_facets()/apply_collection_facets() on the PHP
 * side, so there's no reason for the *live* control to offer a narrower
 * choice than the *default* one already does; a Number/Range field's
 * facet (e.g. "Estimated Hours > 2") needs exactly this vocabulary.
 * Only relevant for "Input": Select/Checkboxes are always exact matches
 * against a fixed list of values, so this control isn't shown for those
 * (see each block's own edit.js).
 *
 * `options` lets a caller narrow this -- gateway/facet (Data Table) still
 * only offers "Contains"/"Equals": its *live* interaction drives
 * DataTables' client-side `column().search()`, a plain substring/regex
 * match with no numeric-comparison concept at all (unlike gateway/
 * card-facet's REST-driven fetch, which reaches the same PHP
 * Facet_Query::apply_facets() the *default* value already does, so it
 * can honor the full vocabulary for real). Supporting ">"/"<" etc. there
 * live would need a genuinely different mechanism (a custom DataTables
 * search plugin doing real numeric comparison against parsed cell
 * values) -- separate, undone work, not a matter of just widening this
 * list.
 *
 * Originally lived under blocks/facet/src/controls/ as gateway/facet's
 * own control; moved here once gateway/card-facet needed the same one.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { FACET_COMPARE_OPTIONS } from './facet-compare-options';

/**
 * @param {Object}     props
 * @param {string}     props.value     Selected compare mode.
 * @param {Function}   props.onChange  ( compare ) => void.
 * @param {Object[]}   [props.options] Compare options to offer -- defaults to the full FACET_COMPARE_OPTIONS vocabulary.
 */
export default function CompareControl( { value, onChange, options } ) {
	return (
		<SelectControl
			label={ __( 'Compare', 'gateway' ) }
			help={ __(
				'How the live filter matches as a visitor interacts with it, here on the front end -- separate from the preset match configured on the parent block’s Facets panel.',
				'gateway'
			) }
			value={ value }
			options={ options || FACET_COMPARE_OPTIONS }
			onChange={ onChange }
		/>
	);
}
