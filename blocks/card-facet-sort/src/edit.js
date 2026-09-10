import { useBlockProps } from '@wordpress/block-editor';
import { __, sprintf } from '@wordpress/i18n';

import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * A real, field-aware (disabled) preview -- unlike gateway/card-facet
 * -search's own generic static preview (nothing to show, it searches
 * every field with no picker at all), this fetches the real orderable
 * -column list the same way gateway/card-field-text/gateway/card-facet's
 * own edit.js files already do (`useAvailableColumns()`), so a site
 * owner sees the actual field list they'll get on the front end rather
 * than a placeholder. Still disabled -- there's no live
 * `.gateway-data-cards-grid` to fetch against in the editor at all (see
 * gateway/card-facet-search/src/edit.js's own docblock for why), only
 * render.php + view.js make the real, enabled control.
 *
 * No settings of its own, so no InspectorControls -- like Search, every
 * orderable field is offered, always; there's nothing to pick.
 */
export default function Edit( { context } ) {
	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const postType = context[ 'gateway/data-cards/postType' ] || 'post';
	const collection = context[ 'gateway/data-cards/collection' ] || '';

	const blockProps = useBlockProps( { className: 'gateway-card-facet-sort' } );

	const { availableColumns } = useAvailableColumns( postType, {
		sourceType,
		collection,
	} );

	const orderableColumns = availableColumns.filter(
		( column ) => column.isOrderable
	);

	// Flattened to one array of {value, label} BEFORE mapping to <option>s
	// -- each field contributes two entries (Ascending, then Descending,
	// matching order-control.js's own ORDER_OPTIONS order) -- so every
	// <option> gets its own unique `key`, rather than needing a `<Fragment
	// key>` wrapper per field.
	const options = orderableColumns.flatMap( ( column ) => [
		{
			value: `${ column.key }:asc`,
			label: sprintf(
				/* translators: %s: field label. */
				__( '%s (Ascending)', 'gateway' ),
				column.label
			),
		},
		{
			value: `${ column.key }:desc`,
			label: sprintf(
				/* translators: %s: field label. */
				__( '%s (Descending)', 'gateway' ),
				column.label
			),
		},
	] );

	return (
		<div { ...blockProps }>
			<label className="gateway-card-facet-sort__label">
				{ __( 'Sort by:', 'gateway' ) }
			</label>
			<select className="gateway-card-facet-sort__select" disabled>
				{ options.map( ( option ) => (
					<option key={ option.value }>{ option.label }</option>
				) ) }
			</select>
		</div>
	);
}
