<?php
/**
 * The "Position" field type -- a plain integer sort order for one of this
 * model's own records, stored as a real column (Schema Blueprint's
 * `integer()`) the same way Number_Field_Type's own value is.
 *
 * Entirely auto-managed, never hand-typed: a new record's own value is
 * appended to the end automatically (`Records_REST_Controller::
 * create_record()`'s own "current max + 1" default via
 * `Model_Fields::resolve_position_value()`), and the ONLY other thing
 * that ever changes it afterwards is dragging a row in RecordsCrud's own
 * table (`PUT /gateway/v1/models/<class>/reorder`, `Records_REST_
 * Controller::reorder_records()`) -- there is no "set a Position by
 * typing a number" story at all, so RecordForm never renders this field
 * (the same "auto-managed, never exposed as an input" treatment a
 * relationship's own hidden foreign-key column already gets), and
 * `supports_default_value()` is false for the same reason Permalink's
 * own is: a default shared by every new record would mean nothing once
 * every record actually gets its own real, appended value on create.
 *
 * `max_one_per_model()` is true -- a model only ever has one meaningful
 * ordering, the same "only one of these makes sense" reasoning
 * Permalink_Field_Type's own docblock gives for that flag.
 *
 * `Model_Fields::position_field_for()` is the single place anything asks
 * "which field is the Position field for model X" -- RecordsCrud.jsx
 * auto-detects a Position field the same way it already auto-detects a
 * Permalink field for the classic WordPress "Permalink: ... View" chrome
 * (`getRecordPermalink()`), and `Records_REST_Controller::resolve_sort()`
 * always allows sorting by it, unconditionally, the same special
 * treatment `id` already gets -- no separate Columns "sortable" opt-in
 * needed for a field whose entire purpose is ordering.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Position_Field_Type implements Field_Type {

	/**
	 * @inheritDoc
	 */
	public static function key() {
		return 'position';
	}

	/**
	 * @inheritDoc
	 */
	public static function label() {
		return __( 'Position', 'gateway' );
	}

	/**
	 * @inheritDoc
	 *
	 * `Advanced` -- the same specialized-power-user-tool home
	 * Permalink_Field_Type's own docblock gives for that type.
	 */
	public static function category() {
		return 'Advanced';
	}

	/**
	 * @inheritDoc
	 */
	public static function blueprint_method() {
		return 'integer';
	}

	/**
	 * @inheritDoc
	 *
	 * Not a real HTML `<input>` type -- there is no input at all for this
	 * field (see this class's own docblock); RecordForm never reaches far
	 * enough to look this up in practice, but every other type still
	 * names one for `describe_all()`'s own sake, and a signal value (not
	 * a literal attribute) is the same convention Permalink's own
	 * `'permalink'` already sets.
	 */
	public static function input_type() {
		return 'position';
	}

	/**
	 * @inheritDoc
	 *
	 * Always resolves to a real integer, never `null` -- unlike almost
	 * every other type, "no value" isn't a meaningful state for something
	 * whose entire purpose is a sort order every record needs one of; a
	 * blank/missing value becomes `0`, the same "never leaves this
	 * ambiguous" reasoning Boolean_Field_Type's own `cast()` already
	 * applies to its own similarly always-meaningful value.
	 */
	public static function cast( $value ) {
		return is_numeric( $value ) ? (int) $value : 0;
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
	 * A numeric sort order is a perfectly meaningful thing to filter by
	 * (e.g. "position >= 10"), the same reasoning Number_Field_Type's own
	 * flag already gives.
	 */
	public static function is_filterable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * Already unconditionally sortable via Records_REST_Controller::
	 * resolve_sort()'s own separate, pre-existing special case for the
	 * REST records-listing endpoint -- declaring `true` here too is what
	 * lets gateway/data-display's own Order By picker offer it as well,
	 * the same field a model's drag-and-drop reordering already manages.
	 */
	public static function is_orderable() {
		return true;
	}

	/**
	 * @inheritDoc
	 *
	 * Its raw integer value is safe, meaningful plain text -- the same
	 * "a plain number renders fine as text" reasoning Number/Range's own
	 * flags already give -- even though the far more common way to
	 * surface it is the Records table's own drag-and-drop, not a
	 * front-end Field: Text block.
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
		return 'integer';
	}

	/**
	 * @inheritDoc
	 *
	 * `instructions` only -- there's no placeholder/prepend/append/rows
	 * story for a field with no input at all (see this class's own
	 * docblock).
	 */
	public static function presentation_fields() {
		return array( 'instructions' );
	}

	/**
	 * @inheritDoc
	 *
	 * A default shared by every new record would mean nothing -- every
	 * record gets its own real, auto-appended value on create instead
	 * (see this class's own docblock), the same reasoning Permalink's own
	 * flag already gives for an identical "always computed, never a fixed
	 * default" shape.
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
	 *
	 * The only other type this applies to besides Permalink -- see this
	 * class's own docblock for why a model only ever has one Position
	 * field.
	 */
	public static function max_one_per_model() {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	public static function is_numeric() {
		return true;
	}
}
