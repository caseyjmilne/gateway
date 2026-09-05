<?php
/**
 * The "File" field type -- Image_Field_Type's own close sibling, for an
 * attachment that isn't necessarily (or even usually) a raster image: a
 * PDF, a spreadsheet, a .zip, ... anything `wp.media()` can accept an
 * upload of. Same underlying storage (a WP attachment post id, Schema
 * Blueprint's `unsignedBigInteger()`) and same three-way `return_format`
 * shape as Image's own, minus everything that only makes sense for an
 * actual image (no width/height bounds, no Preview Size, no MIME-based
 * media-modal filtering) -- see `Field_Type::supports_file_settings()`'s
 * own docblock for the full "why a second flag, not a shared one"
 * reasoning.
 *
 * `cast()` mirrors Image_Field_Type's own exactly -- a numeric value
 * becomes a real int, anything else (including blank/`null`) becomes
 * `null`; no attempt to verify the id actually names a real,
 * still-existing attachment at cast time, same "don't lose data based on
 * stale assumptions" reasoning a Relate to One field's own dangling id
 * already gets.
 *
 * `supports_file_settings()` is `true` -- see that interface method's own
 * docblock for the full settings bundle this gates (`return_format`/
 * `min_size`/`max_size`/`allowed_types`), and `Model_Fields::
 * validate_attachment_constraints()` for how the numeric bounds are
 * actually enforced.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class File_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'file';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'File', 'gateway' );
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
		return 'unsignedBigInteger';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- same "signal, not a literal
	 * attribute" convention as Image_Field_Type's own 'image' --
	 * RecordForm renders this as a media-picker button + filename
	 * instead of any plain `<input>`.
	 */
	public static function input_type() {
		return 'file';
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
	 * A bare attachment id was never a meaningful thing to filter/facet
	 * by -- same reasoning as a Relate to One field's own id.
	 */
	public static function is_filterable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A bare attachment id was never a meaningful thing to sort by --
	 * same reasoning as a Relate to One field's own id.
	 */
	public static function is_orderable() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * A bare attachment id isn't the file itself -- printing it as plain
	 * text would show a meaningless number where a filename/link
	 * belongs.
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
	 *
	 * Just `instructions` -- unlike Image_Field_Type, there's no
	 * `preview_size` equivalent (no registered-sizes concept for an
	 * arbitrary file) and no placeholder/prepend/append (nothing here
	 * decorates a text `<input>`, this is a media picker).
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * Same reasoning as every other picker-style type (Relate/Image):
	 * a default attachment raises the same unanswered "does it still
	 * exist, is it still right for every new record" questions.
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
	 *
	 * This is a generic-file type, not an image one -- see
	 * `supports_file_settings()` below for its own equivalent bundle.
	 */
	public static function supports_media_settings() {
		return false;
	}

	/**
	 * @inheritDoc
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full bundle of settings this gates.
	 */
	public static function supports_file_settings() {
		return true;
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
