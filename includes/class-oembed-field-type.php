<?php
/**
 * The "oEmbed" field type -- a single-line URL, stored exactly like
 * URL_Field_Type's own value (Schema Blueprint's `string()`), but edited
 * through a live embed preview (`OEmbedPicker.jsx`, fetching
 * `GET /wp-json/oembed/1.0/proxy` -- WordPress's own oEmbed proxy route,
 * the exact one the block editor's own Embed block and ACF's own oEmbed
 * field both use) instead of a plain `<input type="url">`.
 *
 * Deliberately stores JUST the URL, nothing enriched -- unlike Image/File,
 * there's no `resolve_*_value()`/`enrich_*_fields()` pair for this type
 * at all: a record's own GET response gives back exactly what was typed
 * in, the same as URL_Field_Type's own value, and the embed HTML itself
 * is fetched fresh (by `OEmbedPicker.jsx`, or by whatever eventually
 * renders this front-end) whenever it's actually needed rather than
 * cached alongside the stored value -- the same "store the reference,
 * resolve on demand" split ACF's own oEmbed field has (`get_field()`
 * always returns the bare URL; a template calls `wp_oembed_get()` itself
 * when it wants the markup).
 *
 * `supports_embed_settings()` is `true` -- see that interface method's
 * own docblock for the `embed_width`/`embed_height` bundle this gates,
 * and why it lives on General rather than Validation.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class OEmbed_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'oembed';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'oEmbed', 'gateway' );
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
		return 'string';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as Image_Field_Type's own 'image' --
	 * RecordForm renders this as an `OEmbedPicker` (a URL input plus a
	 * live embed preview) instead of a plain `<input>`.
	 */
	public static function input_type() {
		return 'oembed';
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
		return false;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_filterable() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_orderable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * The stored value is just a URL -- as safe/meaningful to print as
	 * plain text as URL_Field_Type's own value already is.
	 */
	public static function is_text_renderable() {
		return true;
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
	 * Unlike URL_Field_Type (which does support one), ACF's own oEmbed
	 * field has no Default Value setting either -- mirrored here rather
	 * than added just because its close cousin has it.
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full "why General, not Validation" reasoning.
	 */
	public static function supports_embed_settings() {
		return true;
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
