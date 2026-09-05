<?php
/**
 * The "Post Object" field type -- copies ACF's own Post Object field, per
 * a direct request: "we need a Post Object field type (same as ACF
 * equivalent). It needs (in General Tab) the settings: Filter by Post
 * Type, Filter by Post Status, Filter by Taxonomy. Each of these is an
 * autocomplete searchable of the relevant data. User can select multiple,
 * there needs to be a way to remove them a delete button. Other settings:
 * Return Format, Select Multiple, Required, Allow Null, Instructions."
 *
 * Picks one or more of this site's own WordPress posts (any registered
 * post type, not just this plugin's own Gateway models) -- stored as a
 * plain array of `wp_posts.ID`s, resolved by hand, the same "a real
 * WordPress entity this plugin doesn't own the schema for" reasoning
 * `User_Field_Type`'s own docblock already gives for a WP user id.
 *
 * Always stored as an array, EVEN when `settings.multiple` is off --
 * `Field_Type::blueprint_method()`/`eloquent_cast()` are per-TYPE, not
 * per-field-instance, so they can't vary based on one field's own
 * `multiple` setting the way Buttons/Select/Radio vs. Checkbox (two
 * entirely separate TYPES) get to. `multiple` only ever changes how many
 * of that array's own items `Records_REST_Controller::resolve_post_object_value()`
 * hands back on read -- the single one at index 0 (or `null`, if none)
 * when `multiple` is off, the whole (possibly empty) array when it's on
 * -- and how `PostObjectPicker.jsx` renders (one chip max vs. several).
 * `cast()` itself always normalizes to a plain array either way.
 *
 * `supports_post_object_settings()` is `true` -- see that interface
 * method's own docblock for the full settings bundle this gates.
 *
 * **"Allow Null" is deliberately NOT one of this type's own settings**,
 * despite ACF having one -- reported directly alongside the original
 * request: "I'm not sure what Allow Null is or why we need it... I'm
 * not sure how null and just empty are different." ACF's own Post
 * Object (like its Select) renders as a native `<select>`, which --
 * unless a blank option is explicitly injected -- can NEVER truly hold
 * no value at all: the browser always keeps SOME option selected, so
 * ACF's own "Allow Null" exists purely to inject that blank option and
 * let the field genuinely be empty. `PostObjectPicker.jsx` is never a
 * native `<select>` in the first place -- it's the same search-box
 * -plus-removable-chips widget `RelateAutocomplete.jsx` already uses
 * for Relate to One/Relate to Many, which is ALREADY capable of holding
 * nothing at all (no chip selected = an empty array/`null`) with no
 * setting of its own needed, the same way Relate to One already can.
 * Required is what actually decides whether a genuinely empty selection
 * is accepted when a record is saved; there's no separate "can this
 * technically be empty" question left over for Allow Null to answer.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Post_Object_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'post_object';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Post Object', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * Alongside Relate to One/Relate to Many, `User_Field_Type`, and
	 * `Link_Field_Type` -- what a Post Object actually points at is
	 * another piece of content on this site, the same "a reference to
	 * something" reasoning those three already share, even though (like
	 * User and Link) it deliberately does NOT implement
	 * `Relationship_Field_Type` -- there's no `Model_Relationships`
	 * binding here, since a WP post isn't one of this plugin's own
	 * Gateway models.
	 */
	public static function category() {
		return 'Relational';
	}

	/**
	 * @inheritDoc
	 *
	 * A JSON array in one column -- see this class's own docblock for
	 * why this stays fixed regardless of the field's own `multiple`
	 * setting.
	 */
	public static function blueprint_method() {
		return 'text';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as Image_Field_Type's own 'image' --
	 * RecordForm renders this as `PostObjectPicker.jsx`'s own search
	 * -box-plus-chips widget, never a plain `<input>`/`<select>`.
	 */
	public static function input_type() {
		return 'post_object';
	}

	/**
	 * Normalizes an incoming value into a de-duplicated, order
	 * -preserving array of positive ints -- WordPress's own real post
	 * ids, whatever a request sends them as (a JSON array of numbers is
	 * the normal case; a bare scalar is tolerated too, treated as a
	 * single-item selection, the same "wrap a bare scalar" tolerance
	 * Checkbox_Field_Type::cast() already has). Never validated here
	 * against the field's own configured Filter by Post Type/Status/
	 * Taxonomy settings, or against whether each id still names a real,
	 * still-existing post at all -- cast() is a stateless, per-type
	 * operation with no database access of its own; a since-deleted
	 * post's own id is simply carried over as-is (the same "don't lose
	 * data based on stale assumptions" reasoning a Relate field's own
	 * dangling id already gets), and `Records_REST_Controller::resolve_post_object_value()`
	 * is what actually drops it from the RESOLVED response if `get_post()`
	 * no longer finds it.
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
	 * No single scalar here to compare a facet's own value against --
	 * same "no scalar to compare against" reasoning Checkbox_Field_Type's
	 * own is_filterable() already gives for its own array value.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * One JSON-encoded array in a single text column -- sorting BY that
	 * raw serialized text is exactly as meaningless as faceting by it
	 * already is (see is_filterable() immediately above).
	 */
	public static function is_orderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A bare array of post ids isn't the post itself -- printing it as
	 * plain text would show either a meaningless number (or several) or
	 * the literal word "Array" where a title/link belongs.
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
	 *
	 * Just the universal `instructions` -- ACF's own Post Object has no
	 * placeholder/prepend/append of its own (`PostObjectPicker.jsx` has
	 * no plain text `<input>` on the record editor's own field row for
	 * those to decorate).
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default post raises the same set of questions a Relate field's
	 * own default related record, or an Image field's own default
	 * attachment, already do -- does it still exist, is it still the
	 * right choice for every new record -- without an obvious answer, so
	 * this stays `false` like every other picker-style type.
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
	 */
	public static function supports_user_settings() {
		return false;
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full settings bundle it gates.
	 */
	public static function supports_post_object_settings() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * Post Object's own bundle already covers everything this type
	 * needs (Filter by ..., Select Multiple) -- Page Link's own
	 * `allow_archive_urls` doesn't apply here, since Post Object always
	 * stores a real post id and an archive URL has no post behind it at
	 * all.
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
