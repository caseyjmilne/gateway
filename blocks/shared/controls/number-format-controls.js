/**
 * The actual Style/Decimal Places/Thousands Separator/Currency Symbol/
 * Currency Position controls -- shared between `gateway/card-field-number`'s
 * own Inspector panel (rendered directly, plenty of room in a block's own
 * sidebar) and `gateway/datatable`'s per-column Format modal (see
 * column-config-table.js's own docblock for why THAT one needs a modal at
 * all: the same narrow, fixed-width config table `facet-config-table.js`'s
 * own "Default" modal already had to solve for Compare/Value).
 *
 * A live preview line under the controls (`formatNumber()` against a
 * fixed sample value) is what actually answers "what will this look
 * like" without needing a real record on hand -- useful in both homes,
 * but especially the modal, where there's no visible block canvas nearby
 * to glance at instead.
 */

import { SelectControl, RangeControl, ToggleControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { DEFAULT_NUMBER_FORMAT, formatNumber } from '../number-format';

// A single fixed sample -- negative, fractional, and large enough to
// show thousands-grouping all at once, so the live preview always
// demonstrates every setting's own effect regardless of which are
// currently active.
const PREVIEW_VALUE = -1234.5;

/**
 * @param {Object}   props
 * @param {Object}   props.format   Partial or complete settings -- merged over DEFAULT_NUMBER_FORMAT for display.
 * @param {Function} props.onChange ( nextFormat ) => void -- called with the FULL merged settings object on any change.
 */
export default function NumberFormatControls( { format, onChange } ) {
	const settings = { ...DEFAULT_NUMBER_FORMAT, ...format };

	const update = ( changes ) => onChange( { ...settings, ...changes } );

	return (
		<>
			<SelectControl
				__nextHasNoMarginBottom
				label={ __( 'Style', 'gateway' ) }
				value={ settings.style }
				options={ [
					{ label: __( 'Plain Number', 'gateway' ), value: 'plain' },
					{ label: __( 'Currency', 'gateway' ), value: 'currency' },
					{ label: __( 'Percent', 'gateway' ), value: 'percent' },
				] }
				onChange={ ( style ) => update( { style } ) }
			/>
			<RangeControl
				label={ __( 'Decimal Places', 'gateway' ) }
				min={ 0 }
				max={ 6 }
				value={ settings.decimals }
				onChange={ ( decimals ) => update( { decimals: decimals ?? 0 } ) }
			/>
			<ToggleControl
				label={ __( 'Thousands Separator', 'gateway' ) }
				help={ __( 'e.g. 1,234.50 instead of 1234.50', 'gateway' ) }
				checked={ settings.thousandsSeparator }
				onChange={ ( thousandsSeparator ) => update( { thousandsSeparator } ) }
			/>
			{ 'currency' === settings.style && (
				<>
					<TextControl
						__nextHasNoMarginBottom
						label={ __( 'Currency Symbol', 'gateway' ) }
						value={ settings.currencySymbol }
						onChange={ ( currencySymbol ) => update( { currencySymbol } ) }
					/>
					<SelectControl
						__nextHasNoMarginBottom
						label={ __( 'Symbol Position', 'gateway' ) }
						value={ settings.currencyPosition }
						options={ [
							{ label: __( 'Before the number ($4.55)', 'gateway' ), value: 'before' },
							{ label: __( 'After the number (4.55$)', 'gateway' ), value: 'after' },
						] }
						onChange={ ( currencyPosition ) => update( { currencyPosition } ) }
					/>
				</>
			) }
			<p className="description gateway-number-format-preview">
				{ __( 'Preview:', 'gateway' ) } <code>{ formatNumber( PREVIEW_VALUE, settings ) }</code>
			</p>
		</>
	);
}
