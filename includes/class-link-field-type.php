<?php
/**
 * The "Link" field type -- copies ACF's own Link field, per a direct
 * request: "copy ACF link field type, it has URL/Link Text and Open link
 * in new tab in the UI. UI also has list of pages and posts from the site
 * under the manual entry and if the user clicks these the URL is put in
 * automatically. Configuration for link field is simply Link, link,
 * Return Value, Required, Instructions. The return value is either array
 * or URL."
 *
 * A single JSON object, `{url, title, target}` -- `target` is `'_blank'`
 * (open in a new tab) or `''` (same tab), matching ACF's own literal
 * `target` attribute value rather than inventing a separate boolean.
 * Stored as one JSON object in a single `text` column (blueprint_method()),
 * via Eloquent's own 'array' cast (eloquent_cast()) -- the exact same
 * "structured value in a text column" shape Checkbox_Field_Type's own
 * array-of-choices already uses, just an associative shape here instead
 * of an indexed one; Eloquent's 'array' cast round-trips either shape
 * identically. `null` (not an empty array) means "no link configured" --
 * see cast()'s own docblock for why an empty array is never a real state
 * here the way `[]` is for Checkbox.
 *
 * Picking a page/post from the site in `LinkPicker.jsx`'s own "Or link to
 * existing content" list only ever COPIES that item's current permalink
 * into `url` (and its title into `title`) at the moment it's clicked --
 * this is never a live reference the way a Relate field's own foreign key
 * is. If that page is later renamed or its slug changes, this field's own
 * already-saved `url` does not follow it, the same one-time-copy tradeoff
 * ACF's own Link field has always had.
 *
 * `supports_link_settings()` is `true` -- see that interface method's own
 * docblock for the single `return_format` setting this gates ('array',
 * the default, giving back the full `{url, title, target}` object, or
 * 'url', giving back just the bare URL string) and
 * `Records_REST_Controller::resolve_link_value()` for where it's actually
 * applied on read.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Link_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'link';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Link', 'gateway' );
	}

	/**
	 * @inheritDoc
	 */
	public static function category() {
		return 'Content';
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
	 * attribute" convention as Image_Field_Type's own 'image' --
	 * RecordForm renders this as `LinkPicker.jsx`'s own button/summary
	 * plus an "Insert/edit link" modal, never a plain `<input>`.
	 */
	public static function input_type() {
		return 'link';
	}

	/**
	 * Normalizes an incoming value into `null` (no link at all) or a
	 * real `array( 'url' => ..., 'title' => ..., 'target' => ... )` --
	 * never a partial shape (a `title`/`target` with no `url` is exactly
	 * as meaningless as no value at all, since there's nothing left to
	 * link to). `url` is run through `esc_url_raw()` -- the same
	 * WordPress core function a post's own meta/options URL values are
	 * sanitized with -- rather than just `sanitize_text_field()`, since
	 * an unsanitized URL can carry things (a stray `javascript:` scheme,
	 * e.g.) that function alone wouldn't strip. `target` only ever
	 * survives as the literal string `'_blank'` -- anything else
	 * (including ACF's other real value, `''`) normalizes to `''`,
	 * mirroring True_False_Field_Type's own "a fixed, small vocabulary,
	 * never an arbitrary string" treatment of a value that's really a
	 * boolean underneath.
	 *
	 * @inheritDoc
	 */
	public static function cast( $value ) {
		if ( ! is_array( $value ) ) {
			return null;
		}

		$url = esc_url_raw( trim( (string) ( $value['url'] ?? '' ) ) );

		if ( '' === $url ) {
			return null;
		}

		return array(
			'url'    => $url,
			'title'  => sanitize_text_field( trim( (string) ( $value['title'] ?? '' ) ) ),
			'target' => '_blank' === ( $value['target'] ?? '' ) ? '_blank' : '',
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
	 * own is_filterable() already gives for its own structured value.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * gateway/card-field-text prints `(string) $value` -- casting an
	 * array to a string in PHP emits an "Array to string conversion"
	 * warning and prints the literal word "Array", never anything a
	 * visitor could read. A dedicated block that prints the link itself
	 * (as an actual `<a href>`, honoring `target`) is real, separate,
	 * undone work.
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
		return 'array';
	}

	/**
	 * @inheritDoc
	 *
	 * Just the universal `instructions` -- ACF's own Link field has no
	 * placeholder/prepend/append of its own (`LinkPicker.jsx` has no
	 * plain text `<input>` on the record editor's own field row for
	 * those to decorate; the URL/Link Text inputs live inside its own
	 * modal instead).
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default link raises the same set of questions a Relate field's
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the single `return_format` setting it gates.
	 */
	public static function supports_link_settings() {
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
