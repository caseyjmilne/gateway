<?php
/**
 * The "User" field type -- picks one or more of this site's own
 * registered WP users -- a real WordPress entity, just not one of THIS
 * plugin's own Gateway models, so there's no `Model_Relationships`-style
 * `belongsTo` to declare here, only a plain array of `wp_users.ID`s this
 * type's own REST-layer enrichment (`Records_REST_Controller::
 * resolve_user_value()`) resolves by hand -- the same relationship
 * `Image_Field_Type`'s own docblock describes for an attachment id, just
 * for `wp_users` instead of `wp_posts`.
 *
 * **Always stored as an array, EVEN when `settings.multiple` is off** --
 * the exact same `Field_Type::blueprint_method()`/`eloquent_cast()`
 * are-per-TYPE-not-per-field-instance reasoning `Post_Object_Field_Type`'s
 * own docblock already gives (they can't vary based on one field's own
 * `multiple` setting the way Buttons/Select/Radio vs. Checkbox -- two
 * entirely separate TYPES -- get to). `multiple` only ever changes how
 * many of that array's own items `Records_REST_Controller::
 * enrich_user_fields()` hands back on read (the single one at index 0,
 * or `null` if none, when off; the whole, possibly-empty array when on)
 * and how `UserPicker.jsx` renders (one chip max vs. several). `cast()`
 * itself always normalizes to a plain, de-duplicated, order-preserving
 * array of positive ints either way -- the identical shape/tolerance
 * `Post_Object_Field_Type::cast()` already has (a bare scalar wrapped
 * into a one-item array, no attempt to verify an id actually names a
 * real, still-existing user at cast time -- a since-deleted user's own
 * id is left alone rather than silently dropped, the same "don't lose
 * data based on stale assumptions" reasoning a Relate to One field's own
 * dangling id already gets; `resolve_user_value()` is what actually
 * degrades gracefully, at READ time, if the user behind an id is gone).
 *
 * This type originally shipped SINGLE-select only, a bare
 * `unsignedBigInteger` column -- reported directly, later, alongside
 * Filter by Role: "ensure user has these settings: Filter by Role
 * Return Format Select Multiple Required Instructions... maybe return
 * format and select multiple" are missing too. Adding Select Multiple
 * genuinely required this storage change (a single int column can never
 * hold more than one id) -- confirmed directly before making it that no
 * live User field data existed yet to preserve, since `Model_Fields::
 * update()` never migrates a column on a settings-only change (this
 * field's own `type` never changes, just its `settings`), so there was
 * no in-place upgrade path available for existing data either way.
 *
 * `supports_user_settings()` is `true` -- see that interface method's
 * own docblock for the full settings bundle this gates
 * (`return_format`/`multiple`/`filter_roles`).
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
	 *
	 * `'text'`, not `unsignedBigInteger` (what this type originally
	 * used, back when it was single-select only) -- a JSON array of user
	 * ids in one column, via Eloquent's own `'array'` cast
	 * (`eloquent_cast()`), the exact same "structured value in a text
	 * column" shape `Post_Object_Field_Type` already uses. See this
	 * class's own docblock for why the underlying storage always stays
	 * an array regardless of `settings.multiple`.
	 */
	public static function blueprint_method() {
		return 'text';
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
	 * Normalizes an incoming value into a de-duplicated, order
	 * -preserving array of positive ints -- tolerates a bare scalar
	 * (wrapped as a single-item array), never validates against
	 * `filter_roles` or whether an id still names a real user (stateless,
	 * no DB access -- see this class's own docblock for why staleness is
	 * tolerated rather than scrubbed). Identical in shape to
	 * `Post_Object_Field_Type::cast()`.
	 *
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value ) {
			return array();
		}

		$items = is_array( $value ) ? $value : array( $value );

		return array_values(
			array_unique(
				array_filter(
					array_map( 'absint', $items )
				)
			)
		);
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
	 * A bare user id (or, with Filter by Role's own `multiple` on, a
	 * JSON-encoded array of them) was never a meaningful thing to sort
	 * by -- same reasoning as a Relate to One field's own id.
	 */
	public static function is_orderable() {
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
	public static function is_markdown_renderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function eloquent_cast() {
		return 'array';
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
	public static function supports_link_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_post_object_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function supports_page_link_settings() {
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
