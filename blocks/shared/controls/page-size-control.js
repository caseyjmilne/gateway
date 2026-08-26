/**
 * "Page Size" number field, shared by every block's Inspector panel that
 * needs a "how many items per page" setting.
 *
 * For gateway/datatable, this maps to DataTables' `pageLength` option (via
 * a data attribute read in shared/datatable.js); for gateway/data-cards, it
 * maps to `Data_Cards_Renderer`'s own `posts_per_page`/length-menu logic
 * (PHP-side) the same way. Accepts only positive integers; unlike Limit, 0
 * isn't meaningful here (a page needs at least 1 item), so invalid/zero
 * input falls back to the default. Originally lived under
 * blocks/datatable/src/controls/ as the first consumer; moved here,
 * unchanged, alongside PostTypeControl/LimitControl.
 */

import { useEffect, useState } from '@wordpress/element';
import { TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Parse arbitrary input into a valid page size: a positive integer.
 * Anything unparsable (or less than 1) falls back to the default.
 *
 * @param {string} raw Raw field value.
 * @return {number} Sanitized page size.
 */
function sanitizePageSize( raw ) {
	const parsed = parseInt( raw, 10 );
	return Number.isNaN( parsed ) || parsed < 1 ? DEFAULT_PAGE_SIZE : parsed;
}

export default function PageSizeControl( { value, onChange } ) {
	// Buffer the field's raw text locally so the user can freely clear/edit
	// it (a controlled input bound directly to the sanitized numeric
	// attribute would snap back on every keystroke that isn't yet valid).
	const [ inputValue, setInputValue ] = useState(
		String( value || DEFAULT_PAGE_SIZE )
	);

	useEffect( () => {
		setInputValue( String( value || DEFAULT_PAGE_SIZE ) );
	}, [ value ] );

	const handleChange = ( raw ) => {
		setInputValue( raw );

		if ( raw === '' ) {
			return;
		}

		const parsed = parseInt( raw, 10 );

		if ( ! Number.isNaN( parsed ) && parsed >= 1 ) {
			onChange( parsed );
		}
	};

	const handleBlur = () => {
		const sanitized = sanitizePageSize( inputValue );
		onChange( sanitized );
		setInputValue( String( sanitized ) );
	};

	return (
		<TextControl
			label={ __( 'Page Size', 'gateway' ) }
			help={ __(
				'Number of rows to show per page in the grid.',
				'gateway'
			) }
			type="number"
			min="1"
			step="1"
			value={ inputValue }
			onChange={ handleChange }
			onBlur={ handleBlur }
		/>
	);
}
