<?php
/**
 * The list of every field type Gateway's Field Editor and record CRUD UI
 * can offer -- shares Registry's own register()/all()/has()/count()/
 * unregister() (a field type class is registered exactly like a model or
 * migration class: `Field_Type_Registry::register( Text_Field_Type::class )`),
 * plus lookups specific to field types: finding one by its own key(), and
 * describing every registered one for the REST API (see
 * Field_Type_REST_Controller) that the admin app builds its type
 * dropdowns from, rather than keeping its own separate hardcoded list.
 *
 * The two built-in types (Text_Field_Type, Number_Field_Type) are
 * registered in gateway_boot(); a `gateway_register_field_types` action
 * fires right after, for a future type to hook into the same way models/
 * migrations already can.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Field_Type_Registry extends Registry {

	/**
	 * @inheritDoc
	 */
	protected static function registry_key() {
		return 'field_type';
	}

	/**
	 * @inheritDoc
	 */
	protected static function required_base() {
		return '\Gateway\Field_Type';
	}

	/**
	 * @param string $key A field type's own key(), e.g. "number".
	 * @return string|null The registered class implementing it, or null
	 *                       if none does.
	 */
	public static function get( $key ) {
		foreach ( self::all() as $class ) {
			if ( class_exists( $class ) && $class::key() === $key ) {
				return $class;
			}
		}

		return null;
	}

	/**
	 * @return string[] Every registered type's own key(), e.g.
	 *                    ['text', 'number'] -- what a field's 'type'
	 *                    value is allowed to be.
	 */
	public static function keys() {
		$keys = array();

		foreach ( self::all() as $class ) {
			if ( class_exists( $class ) ) {
				$keys[] = $class::key();
			}
		}

		return $keys;
	}

	/**
	 * Every registered type's key/label/input_type/is_sensitive -- what
	 * the admin app's Field Editor and record CRUD forms need to build a
	 * type dropdown, know which kind of <input> (or <textarea>) to
	 * render, and know whether to mask a value in a list view, without
	 * duplicating that knowledge in JavaScript.
	 *
	 * `relationship_type` is `null` for every plain field type, or one of
	 * Model_Relationships::TYPES' own keys ('belongsTo'/'belongsToMany')
	 * for a Relationship_Field_Type (Relate_To_One_Field_Type/
	 * Relate_To_Many_Field_Type) -- this is what tells the admin app's
	 * Field Editor a type needs an extra "which relationship" step (and
	 * which of the model's own configured relationships to offer for it)
	 * instead of the usual free-text Name input, without hardcoding
	 * either type's own key there.
	 *
	 * `has_choices`/`is_multiple` are the Choice_Field_Type counterpart to
	 * `relationship_type` above: `has_choices` (`true` for Buttons/Select/
	 * Radio/Checkbox) is what tells the admin app's Field Editor a type
	 * needs its own orderable choices-list editor shown at all, and
	 * `is_multiple` (`Choice_Field_Type::is_multiple()`, `null` for every
	 * non-choice type) is what tells RecordForm.jsx whether that field's
	 * own value/control is a single selection (Buttons/Select/Radio) or a
	 * set (Checkbox) -- neither hardcoded by key() anywhere in JavaScript.
	 *
	 * `presentation_fields` (`Field_Type::presentation_fields()`) is what
	 * tells `FieldEditor`'s own Presentation tab which of its fixed
	 * `instructions`/`placeholder`/`step`/`prepend`/`append` inputs to
	 * actually show for the currently-picked type -- `['instructions']`
	 * for every type except `Text_Field_Type`/`Number_Field_Type`/
	 * `Range_Field_Type` today (which recognize more), same "the type
	 * itself declares this, not a per-type list living in JavaScript"
	 * reasoning as `has_choices`.
	 *
	 * `supports_default_value` (`Field_Type::supports_default_value()`) is
	 * the same idea for a different tab: whether `FieldEditor`'s own
	 * General tab should show a Default Value input at all for the
	 * currently-picked type -- `true` only for `Text_Field_Type`/
	 * `Number_Field_Type`/`Range_Field_Type` today.
	 *
	 * `supports_character_limit` (`Field_Type::supports_character_limit()`)
	 * is the same idea again for Validation: whether `FieldEditor`'s own
	 * Validation tab should show a Character Limit input at all for the
	 * currently-picked type -- `true` only for `Text_Field_Type`/
	 * `Text_Area_Field_Type` today.
	 *
	 * `supports_range_limits` (`Field_Type::supports_range_limits()`) is
	 * the same idea once more, also for Validation: whether it should show
	 * Minimum Value/Maximum Value inputs instead -- `true` only for
	 * `Range_Field_Type` today.
	 *
	 * @return array<int,array{key:string,label:string,input_type:string,is_sensitive:bool,relationship_type:?string,has_choices:bool,is_multiple:?bool,presentation_fields:string[],supports_default_value:bool,supports_character_limit:bool,supports_range_limits:bool}>
	 */
	public static function describe_all() {
		$described = array();

		foreach ( self::all() as $class ) {
			if ( ! class_exists( $class ) ) {
				continue;
			}

			$has_choices = is_subclass_of( $class, Choice_Field_Type::class );

			$described[] = array(
				'key'                      => $class::key(),
				'label'                    => $class::label(),
				'input_type'               => $class::input_type(),
				'is_sensitive'             => $class::is_sensitive(),
				'relationship_type'        => is_subclass_of( $class, Relationship_Field_Type::class ) ? $class::relationship_type() : null,
				'has_choices'              => $has_choices,
				'is_multiple'              => $has_choices ? $class::is_multiple() : null,
				'presentation_fields'      => $class::presentation_fields(),
				'supports_default_value'   => $class::supports_default_value(),
				'supports_character_limit' => $class::supports_character_limit(),
				'supports_range_limits'    => $class::supports_range_limits(),
			);
		}

		return $described;
	}
}
