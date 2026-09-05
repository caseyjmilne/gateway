<?php
/**
 * The "Page Link" field type -- copies ACF's own Page Link field, per a
 * direct request: "we need a Page Link similar to ACF page link with
 * following options supported: Page Link page_link Filter by Post Type
 * Filter by Post Status Filter by Taxonomy Allow Archive URL's Select
 * Multiple Required Instructions. The resulting UI is a searchable
 * select and the items are organized as shown in the screenshot. I'm
 * not sure what show archives means exactly but see if you can
 * replicate that capability." -- followed by a screenshot of ACF's own
 * real Page Link field: a closed, `<select>`-styled box showing the
 * current value, opening into a live search box over a scrollable,
 * GROUPED list ("Archives" as one group, then a group per matching post
 * type, e.g. "Post").
 *
 * `Page_Link_Field_Type`'s own close sibling of `Post_Object_Field_Type`
 * -- same "Filter by Post Type/Post Status/Taxonomy" trio, same "Select
 * Multiple" switch, same "every registered post type, not just this
 * plugin's own Gateway models" scope -- but with ONE real, meaningful
 * difference that keeps this a genuinely separate type rather than just
 * a copy of Post Object with different labels: **this field stores a
 * URL, never a post id.** ACF's own Page Link field returns a URL (or
 * array of them) for exactly this reason -- "Allow Archive URLs" lets a
 * site owner pick a post TYPE's own ARCHIVE URL
 * (`get_post_type_archive_link()`) as a value, and an archive URL has
 * no underlying post behind it at all to have an id for. Post Object's
 * own array-of-ids storage genuinely can't represent that; a plain
 * array of URL strings can represent both a real post's own permalink
 * AND a post type's own archive link identically, with no special
 * casing needed between them once stored.
 *
 * Always stored as an array, EVEN when `settings.multiple` is off --
 * same "`Field_Type::blueprint_method()`/`eloquent_cast()` are
 * per-TYPE, not per-field-instance" reasoning `Post_Object_Field_Type`'s
 * own docblock already gives. `multiple` only ever changes how many of
 * that array's own items a REST response hands back on read (the single
 * one at index 0, or `null`, when off; the whole array when on) and how
 * `PageLinkPicker.jsx` renders. `cast()` itself always normalizes to a
 * plain, de-duplicated, order-preserving array of real URLs either way.
 *
 * **No `return_format` setting at all**, unlike Post Object -- ACF's own
 * Page Link field has no such setting either. There's nothing to choose
 * a format FOR: the value is always just the URL (or array of URLs),
 * never a richer object or a bare id, since (again) an archive URL has
 * no post id to alternatively return -- a `return_format: 'object'`
 * couldn't be given a real `{id, title, ...}` shape for one.
 *
 * `supports_page_link_settings()` is `true` -- see that interface
 * method's own docblock for the full settings bundle this gates,
 * including `allow_archive_urls`.
 *
 * **No "Allow Null" setting either, for the exact same reason
 * `Post_Object_Field_Type`'s own docblock already gives**:
 * `PageLinkPicker.jsx` is never a native `<select>` that can't
 * genuinely hold nothing (see that class's own docblock for the full
 * "ACF's Allow Null exists purely to work around a native `<select>`'s
 * own limitation" reasoning) -- it's a search-box-plus-removable-chips/
 * combobox widget that's already capable of holding an empty selection
 * with no extra setting needed. Required is what actually decides
 * whether an empty selection is accepted when a record is saved.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Page_Link_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'page_link';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Page Link', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * Alongside Post Object/Link/User/Relate to One/Relate to Many --
	 * what a Page Link actually points at is another piece of content
	 * on this site (or a post type's own archive), the same "a
	 * reference to something" reasoning those already share, even
	 * though it deliberately does NOT implement `Relationship_Field_Type` --
	 * there's no `Model_Relationships` binding here, and unlike Post
	 * Object it isn't even always a real post at all (an archive URL is
	 * never one).
	 */
	public static function category() {
		return 'Relational';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'text';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as Image/Link/Post Object's own -- RecordForm
	 * renders this as `PageLinkPicker.jsx`'s own combobox, never a plain
	 * `<input>`.
	 */
	public static function input_type() {
		return 'page_link';
	}

	/**
	 * Normalizes an incoming value into a de-duplicated, order
	 * -preserving array of real URLs -- tolerates a bare scalar
	 * (wrapped as a single-item array), runs each entry through
	 * `esc_url_raw()` (the same WordPress core function
	 * `Link_Field_Type::cast()`'s own `url` already goes through,
	 * rather than just `sanitize_text_field()`, since an unsanitized
	 * URL can carry things -- a stray `javascript:` scheme, e.g. --
	 * that function alone wouldn't strip), and drops anything that
	 * sanitizes down to blank. Never validates that a URL still
	 * resolves to a real post/archive (stateless, no DB access -- the
	 * same "don't lose data based on stale assumptions" precedent
	 * `Post_Object_Field_Type::cast()`'s own docblock already sets: a
	 * post later trashed, or a post type's own archive later disabled,
	 * should never silently corrupt what was actually selected).
	 *
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( null === $value ) {
			return array();
		}

		$items = is_array( $value ) ? $value : array( $value );

		$urls = array_map(
			function ( $item ) {
				return esc_url_raw( trim( (string) $item ) );
			},
			$items
		);

		return array_values( array_unique( array_filter( $urls ) ) );
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
	 * same reasoning Post_Object_Field_Type's own is_filterable()
	 * already gives for its own structured (array) value.
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
	 * An array value, same as Post_Object_Field_Type -- see that type's
	 * own is_text_renderable() for the identical reasoning.
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
	 * Just the universal `instructions` -- same as Post Object/Link,
	 * no placeholder/prepend/append of its own.
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
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
	 * Page Link's own `filter_post_types`/`filter_post_statuses`/
	 * `filter_taxonomies`/`multiple` live in `supports_page_link_settings()`'s
	 * own bundle instead -- see that interface method's own docblock for
	 * why this is a genuinely separate bundle rather than just reusing
	 * Post Object's (no `return_format`, plus `allow_archive_urls`).
	 */
	public static function supports_post_object_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full settings bundle it gates.
	 */
	public static function supports_page_link_settings() {
		return true;
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
