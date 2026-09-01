/**
 * JS mirror of `Gateway\Number_Formatter` (see that class's own PHP
 * docblock for the full reasoning behind each setting) -- used ONLY for
 * a live editor preview (`gateway/card-field-number`'s own edit.js, and
 * this same module's own preview line inside `NumberFormatControls`
 * below). Every REAL render -- the front end, and every block's own
 * `<ServerSideRender>`-backed editor preview (gateway/datatable-body's
 * own column config, e.g.) -- goes through the real PHP class instead;
 * this only ever has to be "close enough" for a momentary preview, not
 * byte-for-byte identical, since nothing here ever reaches a visitor.
 */

export const DEFAULT_NUMBER_FORMAT = {
	style: 'plain',
	decimals: 2,
	thousandsSeparator: true,
	currencySymbol: '$',
	currencyPosition: 'before',
};

/**
 * @param {number|string|null|undefined} value  Raw value to format.
 * @param {Object}                       format Partial or complete settings -- merged over DEFAULT_NUMBER_FORMAT.
 * @return {string} Formatted display string, or '' if `value` isn't a real number.
 */
export function formatNumber( value, format = {} ) {
	if ( null === value || undefined === value || '' === value || isNaN( Number( value ) ) ) {
		return '';
	}

	const settings = { ...DEFAULT_NUMBER_FORMAT, ...format };
	const decimals = Math.max( 0, Math.min( 6, Number( settings.decimals ) || 0 ) );

	const number = Number( value );
	const isNegative = number < 0;
	const absolute = Math.abs( number );

	let formatted = absolute.toFixed( decimals );

	if ( settings.thousandsSeparator ) {
		const [ integerPart, decimalPart ] = formatted.split( '.' );
		const grouped = integerPart.replace( /\B(?=(\d{3})+(?!\d))/g, ',' );
		formatted = decimalPart ? `${ grouped }.${ decimalPart }` : grouped;
	}

	if ( 'currency' === settings.style ) {
		const symbol = settings.currencySymbol || DEFAULT_NUMBER_FORMAT.currencySymbol;
		formatted =
			'before' === settings.currencyPosition
				? `${ symbol }${ formatted }`
				: `${ formatted }${ symbol }`;
	} else if ( 'percent' === settings.style ) {
		formatted = `${ formatted }%`;
	}

	return ( isNegative ? '-' : '' ) + formatted;
}
