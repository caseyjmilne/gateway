/**
 * "Order By" + "Order" picker pair, shared by any block that runs a real,
 * server-sorted query (currently only gateway/data-cards -- gateway/
 * data-display's own Parent/Child Order panels predate this file and build
 * their own two SelectControls inline; this is the same shape, pulled out
 * once a second consumer needed it).
 *
 * Both attributes default to `''` -- "leave this source type's own
 * existing default order alone" (see gateway/data-cards/render.php's own
 * docblock) -- rather than a real field/direction value, per a direct
 * request: "Default can be left how it is... Whatever the default is show
 * it in the settings so the user is aware." Baking today's default
 * straight into the ATTRIBUTE's own default would describe only ONE
 * source type's default (gateway/data-cards' postType branch defaults to
 * `orderby: 'date'`, its Collection branch to `id` -- a single shared
 * attribute default can't be both), and would freeze it permanently,
 * unable to later track a site owner's own change to what "default"
 * means.
 *
 * The picker itself still only ever shows ONE real option selected,
 * though -- an earlier version added a separate "Default (ID)" choice
 * alongside the real "ID" option already in the list, which read as a
 * confusing duplicate. Fixed by never showing `''` itself: `value` here
 * substitutes in `defaultOrderByValue`/`defaultOrder` (the field/direction
 * this source type's default ACTUALLY resolves to right now) whenever the
 * attribute itself is still `''`, so the picker always shows a single,
 * real, correct selection -- accomplishing the same "show the user what
 * the default is" without a second entry for it. Picking that same
 * already-shown option is harmless: it stores the real value instead of
 * `''`, which every resolver on the PHP side (`Model_Fields::
 * resolve_orderby()`/`Column_Registry::resolve_post_orderby()`) already
 * treats identically to the default it just happens to match.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const ORDER_OPTIONS = [
	{ label: __( 'Ascending', 'gateway' ), value: 'asc' },
	{ label: __( 'Descending', 'gateway' ), value: 'desc' },
];

/**
 * @param {Object}   props
 * @param {string}   props.orderBy             Current `orderBy` attribute ('' for "default").
 * @param {string}   props.order               Current `order` attribute ('asc'/'desc'/'' for "default").
 * @param {Object[]} props.orderByOptions      `{label, value}` choices -- already filtered to
 *                                              whichever fields are actually orderable for the
 *                                              block's current source (see each caller's own
 *                                              `isOrderable`-filtered list).
 * @param {string}   props.defaultOrderByValue The real field key this source type actually
 *                                              sorts by when `orderBy` is `''` (e.g. 'id' for a
 *                                              Collection, 'post_date' for a post type) -- must
 *                                              be one of `orderByOptions`' own values.
 * @param {string}   props.defaultOrder        'asc'/'desc' -- the real direction this source
 *                                              type actually sorts by when `order` is `''`.
 * @param {Function} props.onOrderByChange
 * @param {Function} props.onOrderChange
 */
export default function OrderControl( {
	orderBy,
	order,
	orderByOptions,
	defaultOrderByValue,
	defaultOrder,
	onOrderByChange,
	onOrderChange,
} ) {
	return (
		<>
			<SelectControl
				label={ __( 'Order By', 'gateway' ) }
				value={ orderBy || defaultOrderByValue }
				options={ orderByOptions }
				onChange={ onOrderByChange }
			/>
			<SelectControl
				label={ __( 'Order', 'gateway' ) }
				value={ order || defaultOrder }
				options={ ORDER_OPTIONS }
				onChange={ onOrderChange }
			/>
		</>
	);
}
