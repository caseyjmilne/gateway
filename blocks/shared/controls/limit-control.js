/**
 * "Limit" number field, shared by every block's Inspector panel that needs
 * a "maximum items" setting (gateway/datatable, gateway/data-cards).
 *
 * Accepts only non-negative integers; 0 means "no limit". Originally lived
 * under blocks/datatable/src/controls/ as the first consumer; moved here,
 * unchanged, alongside PostTypeControl once gateway/data-cards needed it too.
 */

import { useEffect, useState } from '@wordpress/element';
import { TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Parse arbitrary input into a valid limit value: a non-negative integer.
 * Anything unparsable (or negative) falls back to 0 (no limit).
 *
 * @param {string} raw Raw field value.
 * @return {number} Sanitized limit.
 */
function sanitizeLimit( raw ) {
	const parsed = parseInt( raw, 10 );
	return Number.isNaN( parsed ) || parsed < 0 ? 0 : parsed;
}

export default function LimitControl( { value, onChange } ) {
	// Buffer the field's raw text locally so the user can freely clear/edit
	// it (a controlled input bound directly to the sanitized numeric
	// attribute would snap back on every keystroke that isn't yet valid).
	const [ inputValue, setInputValue ] = useState( String( value ?? 0 ) );

	useEffect( () => {
		setInputValue( String( value ?? 0 ) );
	}, [ value ] );

	const handleChange = ( raw ) => {
		setInputValue( raw );

		if ( raw === '' ) {
			return;
		}

		const parsed = parseInt( raw, 10 );

		if ( ! Number.isNaN( parsed ) && parsed >= 0 ) {
			onChange( parsed );
		}
	};

	const handleBlur = () => {
		const sanitized = sanitizeLimit( inputValue );
		onChange( sanitized );
		setInputValue( String( sanitized ) );
	};

	return (
		<TextControl
			label={ __( 'Limit', 'gateway' ) }
			help={ __(
				'Maximum number of items to show in the grid. Use 0 for no limit.',
				'gateway'
			) }
			type="number"
			min="0"
			step="1"
			value={ inputValue }
			onChange={ handleChange }
			onBlur={ handleBlur }
		/>
	);
}
