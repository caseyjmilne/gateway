<?php
/**
 * The "User" field type -- picks one of this site's own registered WP
 * users, stored as that user's own `wp_users.ID` (Schema Blueprint's
 * `unsignedBigInteger()`, the exact same column shape `Relate_To_One_Field_Type`'s
 * own foreign key and `Image_Field_Type`'s own attachment id both use --
 * a WP user IS a real WordPress entity, just not one of THIS plugin's own
 * Gateway models, so there's no `Model_Relationships`-style `belongsTo`
 * to declare here, only a bare id column this type's own REST-layer
 * enrichment (`Records_REST_Controller::resolve_user_value()`) resolves
 * by hand -- the same relationship `Image_Field_Type`'s own docblock
 * describes for an attachment id, just for `wp_users` instead of
 * `wp_posts`).
 *
 * `cast()` mirrors `Relate_To_One_Field_Type`'s/`Image_Field_Type`'s own
 * exactly -- a numeric value becomes a real int, anything else (including
 * blank/`null`) becomes `null`; no attempt to verify the id actually
 * names a real, still-existing user at cast time (a since-deleted user's
 * own id is left alone rather than silently nulled out, the same "don't
 * lose data based on stale assumptions" reasoning a Relate to One field's
 * own dangling id already gets -- `resolve_user_value()` is what actually
 * degrades gracefully, at READ time, if the user behind an id is gone).
 *
 * `supports_user_settings()` is `true` -- see that interface method's own
 * docblock for the one setting it gates (`return_format`) and why it's
 * narrower than `Image_Field_Type`'s/`File_Field_Type`'s own bundle.
 *
 * Filed under `category() === 'Relational'`, alongside Relate to One/
 * Relate to Many -- purely cosmetic (only `TypeSelect.jsx`'s own grouping
 * reads it), but matches ACF's own "User" field, which sits in the same
 * group for the same reason: it's fundamentally a reference to another
 * record, just one this plugin doesn't itself own the schema for.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class User_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'user';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'User', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function category() {
		return 'Relational';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'unsignedBigInteger';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as `Image_Field_Type`'s own `'image'`/
	 * `Relate_To_One_Field_Type`'s own `'relate_one'` -- `RecordForm`
	 * renders this as a search-and-select picker (`UserPicker.jsx`)
	 * instead of any plain `<input>`.
	 */
	public static function input_type() {
		return 'user';
	}

	/**
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value || '' === $value ) {
			return null;
		}

		return is_numeric( $value ) ? (int) $value : null;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_sensitive() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A bare user id was never a meaningful thing to filter/facet by --
	 * same reasoning as a Relate to One field's own id.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A bare user id isn't a name -- printing it as plain text would show
	 * a meaningless number where a person's name belongs (the same
	 * reasoning `Relate_To_One_Field_Type`'s own docblock gives; unlike a
	 * Relate field, there's no enriched `{id, label}` shape this method
	 * could instead point a caller at, since `is_text_renderable()` is
	 * evaluated independently of any particular record's own value).
	 */
	public static function is_text_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_html_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return null;
	}

	/**
	 * @inheritDoc
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default user raises the same set of questions a Relate field's
	 * own default related record does -- does it still exist, is it
	 * still the right choice for every new record -- without an obvious
	 * answer, so this stays `false` like every other picker-style type.
	 */
	public static function supports_default_value() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_character_limit() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_range_limits() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_media_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_file_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_embed_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the one setting it gates.
	 */
	public static function supports_user_settings() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_permalink_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_boolean_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function max_one_per_model() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_numeric() {
		return false;
	}
}
