<?php
/**
 * The "Image" field type -- picks one WordPress media library attachment
 * (`wp.media()`, the same modal a post editor's own Featured Image uses),
 * stored as that attachment's own post id (Schema Blueprint's
 * `unsignedBigInteger()`, the same column shape Relate_To_One_Field_Type's
 * own foreign key uses -- an attachment IS a WP post, `post_type =
 * "attachment"`, just not one of THIS plugin's own Gateway models, so
 * there's no `Model_Relationships`-style `belongsTo` to declare here, only
 * a bare id column this type's own REST-layer enrichment resolves by hand).
 *
 * `cast()` mirrors Relate_To_One_Field_Type's own exactly -- a numeric
 * value becomes a real int, anything else (including blank/`null`) becomes
 * `null`; no attempt to verify the id actually names a real, still-existing
 * attachment at cast time (a since-deleted attachment's own id is left
 * alone rather than silently nulled out, the same "don't lose data based
 * on stale assumptions" reasoning a Relate to One field's own dangling id
 * already gets).
 *
 * `supports_media_settings()` is `true` -- see that interface method's own
 * docblock for the full settings bundle this gates (`return_format`/the
 * min/max width/height/file-size pairs/`allowed_types`), and
 * `Model_Fields::validate_image_constraints()` for how the numeric bounds
 * are actually enforced.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Image_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'image';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Image', 'gateway' );
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
	 * attribute" convention as Text_Area_Field_Type's own 'textarea'/
	 * Relate_To_One_Field_Type's own 'relate_one' -- RecordForm renders
	 * this as a media-picker button + preview instead of any plain
	 * `<input>`.
	 */
	public static function input_type() {
		return 'image';
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
	 * A bare attachment id isn't the image itself -- printing it as plain
	 * text would show a meaningless number where a picture belongs.
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

	/**
	 * @inheritDoc
	 *
	 * `instructions` plus `preview_size` -- a `<select>` of this site's
	 * own registered image sizes (`GET /gateway/v1/image-sizes`,
	 * `wp_get_registered_image_subsizes()` plus a synthetic "Full Size"),
	 * controlling how large a thumbnail `RecordForm` shows while editing.
	 * Deliberately not `placeholder`/`prepend`/`append` -- none of those
	 * mean anything for a media picker, there's no text `<input>` here
	 * for them to decorate.
	 */
	public static function presentation_fields() {
		return array( 'instructions', 'preview_size' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default image raises the same set of questions a Relate field's
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
	 *
	 * The only type this applies to -- see this interface method's own
	 * docblock for the full bundle of settings this gates.
	 */
	public static function supports_media_settings() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * This is an image type, not a generic-file one -- see
	 * File_Field_Type's own `supports_file_settings()` for its
	 * equivalent bundle.
	 */
	public static function supports_file_settings() {
		return false;
	}
}
