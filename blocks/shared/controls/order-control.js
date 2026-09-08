/**
 * "Order By" + "Order" picker pair, shared by any block that runs a real,
 * server-sorted query (currently only gateway/data-cards -- gateway/
 * data-display's own Parent/Child Order panels predate this file and build
 * their own two SelectControls inline; this is the same shape, pulled out
 * once a second consumer needed it).
 *
 * Both fields default to `''` -- "leave this source type's own existing
 * default order alone" (see gateway/data-cards/render.php's own docblock)
 * -- rather than a real field/direction value, per a direct request:
 * "Default can be left how it is... Whatever the default is show it in the
 * settings so the user is aware." Silently defaulting the ATTRIBUTE itself
 * to, say, `orderBy: 'id', order: 'desc'` would only describe the
 * Collection source type's own default -- gateway/data-cards' postType
 * branch defaults to `orderby: 'date'` instead (WP_Query's own native
 * default, never touched by this block before now) -- and would bake
 * today's default into every block permanently, unable to later track a
 * site owner's own change to what "default" means. Leaving both `''` and
 * showing the CURRENT default's own real value only as the first option's
 * label accomplishes both halves of that request at once: nothing changes
 * for an existing or freshly-inserted block, and the default is spelled
 * out right in the picker rather than left for a site owner to guess.
 */

import { SelectControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

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
 * @param {string}   props.defaultOrderByLabel Friendly label for the field this source type
 *                                              actually sorts by when `orderBy` is `''` (e.g.
 *                                              'ID' for a Collection, 'Date' for a post type).
 * @param {string}   props.defaultOrder        'asc'/'desc' -- the real direction this source
 *                                              type actually sorts by when `order` is `''`.
 * @param {Function} props.onOrderByChange
 * @param {Function} props.onOrderChange
 */
export default function OrderControl( {
	orderBy,
	order,
	orderByOptions,
	defaultOrderByLabel,
	defaultOrder,
	onOrderByChange,
	onOrderChange,
} ) {
	const orderByChoices = [
		{
			label: sprintf(
				/* translators: %s: the field currently used by default, e.g. "ID". */
				__( 'Default (%s)', 'gateway' ),
				defaultOrderByLabel
			),
			value: '',
		},
		...orderByOptions,
	];

	const orderChoices = [
		{
			label: sprintf(
				/* translators: %s: "Ascending" or "Descending". */
				__( 'Default (%s)', 'gateway' ),
				'asc' === defaultOrder
					? __( 'Ascending', 'gateway' )
					: __( 'Descending', 'gateway' )
			),
			value: '',
		},
		...ORDER_OPTIONS,
	];

	return (
		<>
			<SelectControl
				label={ __( 'Order By', 'gateway' ) }
				value={ orderBy || '' }
				options={ orderByChoices }
				onChange={ onOrderByChange }
			/>
			<SelectControl
				label={ __( 'Order', 'gateway' ) }
				value={ order || '' }
				options={ orderChoices }
				onChange={ onOrderChange }
			/>
		</>
	);
}
