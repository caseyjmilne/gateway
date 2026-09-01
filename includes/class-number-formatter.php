<?php
/**
 * Turns a raw stored number into a display string per a small, fixed set
 * of "common options" (Plain/Currency/Percent, decimal places, thousands
 * separator, currency symbol/position) -- the shared formatting rules
 * behind both `gateway/card-field-number`'s own single-field display and
 * `gateway/datatable`'s own per-column Number Format (see each one's own
 * render.php). One class, not duplicated logic in each render.php,
 * so "$4.55" means the same thing everywhere a number gets formatted at
 * all.
 *
 * A pure static helper, not a hook-owning service -- nothing here needs
 * to run on its own, so it has no init() and gateway.php only ever
 * require_once's it, the same shape Data_Cards_Renderer already has.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Number_Formatter {

	/**
	 * The three supported display styles. 'plain' is a bare, optionally
	 * grouped decimal number; 'currency' adds a symbol; 'percent' adds a
	 * trailing '%'. Deliberately a small, fixed vocabulary rather than an
	 * open-ended format string (like a `sprintf()`/ICU pattern) -- a site
	 * owner picking from three clearly-labeled options in a `<select>`
	 * can't produce a malformed or confusing result the way free-text
	 * format-string input could.
	 */
	const STYLES = array( 'plain', 'currency', 'percent' );

	/**
	 * Where the currency symbol goes relative to the number -- only
	 * meaningful when `style` is 'currency'. 'before' gives "$4.55",
	 * 'after' gives "4.55$" (some currencies/locales -- e.g. many
	 * European ones -- conventionally put the symbol after the amount).
	 */
	const POSITIONS = array( 'before', 'after' );

	/**
	 * Every setting's own default -- what a freshly-added
	 * `gateway/card-field-number` block, or a Data Table column that's
	 * never had its own Format modal opened at all, uses: a plain number,
	 * 2 decimal places, comma-grouped. `sanitize_settings()` fills in
	 * exactly these for any key missing or invalid in a caller-supplied
	 * settings array, so a caller can always pass a partial (or entirely
	 * empty) array and get a complete, safe-to-use result back.
	 */
	const DEFAULTS = array(
		'style'              => 'plain',
		'decimals'           => 2,
		'thousandsSeparator' => true,
		'currencySymbol'     => '$',
		'currencyPosition'   => 'before',
	);

	/**
	 * Fills in/validates a raw settings array (e.g. a block's own
	 * `numberFormat` attribute, or one Data Table column's own `format`
	 * key) against DEFAULTS -- never trusts a caller-supplied value
	 * outright: an unrecognized `style`/`currencyPosition`, a
	 * non-numeric or out-of-range `decimals`, or a blank `currencySymbol`
	 * all silently fall back to their own default rather than producing
	 * a malformed or empty display string later. Called internally by
	 * `format()` itself, so a caller never strictly has to call this
	 * first -- but the admin app / block editor side calls it too,
	 * so a freshly-opened Format control always starts from a complete,
	 * valid settings object rather than a sparse one it would need its
	 * own separate defaulting logic to merge against.
	 *
	 * @param array $raw Raw, possibly partial/invalid settings.
	 * @return array{style:string,decimals:int,thousandsSeparator:bool,currencySymbol:string,currencyPosition:string}
	 */
	public static function sanitize_settings( $raw ) {
		$raw = is_array( $raw ) ? $raw : array();

		$style = isset( $raw['style'] ) && in_array( $raw['style'], self::STYLES, true )
			? $raw['style']
			: self::DEFAULTS['style'];

		// Clamped to a sane 0-6 range, not just "must be numeric" -- a
		// negative or absurdly large decimal count would either throw
		// (PHP's own number_format() rejects negative decimals outright)
		// or produce a display string nobody actually wants.
		$decimals = isset( $raw['decimals'] ) && is_numeric( $raw['decimals'] )
			? max( 0, min( 6, (int) $raw['decimals'] ) )
			: self::DEFAULTS['decimals'];

		$thousands_separator = array_key_exists( 'thousandsSeparator', $raw )
			? (bool) $raw['thousandsSeparator']
			: self::DEFAULTS['thousandsSeparator'];

		$currency_symbol = isset( $raw['currencySymbol'] ) && is_string( $raw['currencySymbol'] )
			? sanitize_text_field( $raw['currencySymbol'] )
			: '';

		if ( '' === $currency_symbol ) {
			$currency_symbol = self::DEFAULTS['currencySymbol'];
		}

		$currency_position = isset( $raw['currencyPosition'] ) && in_array( $raw['currencyPosition'], self::POSITIONS, true )
			? $raw['currencyPosition']
			: self::DEFAULTS['currencyPosition'];

		return array(
			'style'              => $style,
			'decimals'           => $decimals,
			'thousandsSeparator' => $thousands_separator,
			'currencySymbol'     => $currency_symbol,
			'currencyPosition'   => $currency_position,
		);
	}

	/**
	 * Formats one raw value for display -- '' for anything that isn't a
	 * real number (null, '', a non-numeric string) rather than printing
	 * "0" or a PHP warning; callers (both render.php files) already only
	 * ever call this for a field whose own type is
	 * `Field_Type::is_numeric()`, but a record's own value can still
	 * legitimately be blank (an optional Number field never filled in).
	 *
	 * The sign is handled separately from `number_format()`'s own
	 * built-in negative-number support specifically so a negative
	 * Currency value reads as "-$4.55", not "$-4.55" -- `number_format()`
	 * alone would place the minus sign inside the digits, and simply
	 * concatenating the currency symbol in front of THAT result would
	 * put the symbol before the sign instead of after it.
	 *
	 * @param mixed $value    Raw stored value (int, float, numeric string, or null/'').
	 * @param array $settings Raw or already-sanitized settings -- see sanitize_settings().
	 * @return string Formatted display string, or '' if $value isn't a real number.
	 */
	public static function format( $value, array $settings = array() ) {
		if ( null === $value || '' === $value || ! is_numeric( $value ) ) {
			return '';
		}

		$settings = self::sanitize_settings( $settings );

		$number      = (float) $value;
		$is_negative = $number < 0;
		$number      = abs( $number );

		$formatted = number_format(
			$number,
			$settings['decimals'],
			'.',
			$settings['thousandsSeparator'] ? ',' : ''
		);

		if ( 'currency' === $settings['style'] ) {
			$formatted = 'before' === $settings['currencyPosition']
				? $settings['currencySymbol'] . $formatted
				: $formatted . $settings['currencySymbol'];
		} elseif ( 'percent' === $settings['style'] ) {
			// The stored value IS the percentage already (45 -> "45%"),
			// not a 0-1 fraction needing its own *100 -- matching how a
			// site owner would naturally type a Number field meant to
			// represent a percentage in the first place.
			$formatted .= '%';
		}

		return ( $is_negative ? '-' : '' ) . $formatted;
	}
}
