<?php
/**
 * The "Password" field type -- a single-line string stored exactly like
 * Text_Field_Type's own value (Schema Blueprint's `string()`), rendered
 * as `<input type="password">` so it's masked while being typed.
 *
 * Stored as plain text, not hashed -- this is a generic field type for
 * an arbitrary Eloquent attribute (a "password" a record itself needs to
 * remember, e.g. for an external service), not WordPress's own user
 * authentication, which already has its own hashed storage entirely
 * separate from this. is_sensitive() => true is the one thing that sets
 * it apart behaviorally: RecordsCrud's own list view masks its value
 * there (a plain input[type=password] only masks the *editing* form,
 * not a value already rendered into a table cell) -- see that class's
 * own docblock, and Field_Type's own is_sensitive() docblock for exactly
 * what this does and doesn't cover.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Password_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'password';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Password', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'string';
	}

	/**
	 * @inheritDoc
	 */
	public static function input_type() {
		return 'password';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		return null === $value ? null : (string) $value;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_sensitive() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * A secret value has no legitimate reason to be searchable/facetable
	 * at all -- independent of, if overlapping with, is_sensitive()'s own
	 * masking-on-display concern above.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A secret value has no legitimate reason to ever be printed as
	 * plain, visible text on a public-facing card -- independent of, if
	 * overlapping with, is_sensitive()'s own masking-on-admin-list-view
	 * concern above.
	 */
	public static function is_text_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return null;
	}
}
