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
	 * `category` (`Field_Type::category()`) is what FieldEditor.jsx's own
	 * searchable Type picker groups its options by -- one of `'Basic'`/
	 * `'Content'`/`'Choice'`/`'Relational'`/`'Advanced'`/`'Layout'`, the
	 * same six ACF itself uses. Purely cosmetic (see that interface
	 * method's own docblock), never read for anything behavioral the way
	 * `relationship_type`/`has_choices`/etc. below are.
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
	 * `Range_Field_Type`/`Email_Field_Type`/`URL_Field_Type`/
	 * `Password_Field_Type` today (which recognize more -- `URL_Field_Type`
	 * only `placeholder`, no `prepend`/`append`), same "the type itself
	 * declares this, not a per-type list living in JavaScript" reasoning
	 * as `has_choices`.
	 *
	 * `supports_default_value` (`Field_Type::supports_default_value()`) is
	 * the same idea for a different tab: whether `FieldEditor`'s own
	 * General tab should show a Default Value input at all for the
	 * currently-picked type -- `true` only for `Text_Field_Type`/
	 * `Number_Field_Type`/`Range_Field_Type`/`Email_Field_Type`/
	 * `URL_Field_Type` today.
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
	 * `supports_media_settings` (`Field_Type::supports_media_settings()`)
	 * is the same idea for a whole bundle at once, spanning General
	 * (Return Format), Validation (the min/max width/height/file-size
	 * pairs, Allowed File Types), and -- via `presentation_fields` above,
	 * not this flag -- Presentation (Preview Size) -- `true` only for
	 * `Image_Field_Type` today. See that interface method's own docblock
	 * for why this one setting bundles several keys at once rather than
	 * getting one flag per key the way everything else here does.
	 *
	 * `supports_file_settings` (`Field_Type::supports_file_settings()`)
	 * is `supports_media_settings`'s own close sibling for a generic,
	 * non-image attachment -- General (Return Format), Validation
	 * (min/max file size, Allowed File Types), no Presentation entry at
	 * all (no `preview_size` equivalent) -- `true` only for
	 * `File_Field_Type` today. See that interface method's own docblock
	 * for why this is a second flag rather than folded into
	 * `supports_media_settings` above.
	 *
	 * `supports_embed_settings` (`Field_Type::supports_embed_settings()`)
	 * is a much smaller bundle, entirely on General -- `embed_width`/
	 * `embed_height`, both in px -- `true` only for `OEmbed_Field_Type`
	 * today. See that interface method's own docblock for why these two
	 * live on General rather than Validation the way Image/File's own
	 * numeric bounds do.
	 *
	 * `supports_user_settings` (`Field_Type::supports_user_settings()`)
	 * is the narrowest bundle of all -- just `return_format`, reusing
	 * `supports_media_settings`'s/`supports_file_settings`'s own General
	 * -tab setting and the same `Model_Fields::sanitize_settings()` enum
	 * check, restricted client-side to `'array'`/`'id'` (no `'url'` --
	 * see that interface method's own docblock for why) -- `true` only
	 * for `User_Field_Type` today.
	 *
	 * `supports_permalink_settings` (`Field_Type::supports_permalink_settings()`)
	 * gates `source_field`/`root`/`template_page_id`, all General --
	 * `true` only for `Permalink_Field_Type` today. `max_one_per_model`
	 * (`Field_Type::max_one_per_model()`) is a separate, narrower flag --
	 * also `true` only for `Permalink_Field_Type` today, but independent
	 * of the settings bundle above (a future type could in principle
	 * need one without the other) -- what `FieldEditor.jsx`'s own Type
	 * picker reads to grey out an already-configured one-per-model type,
	 * the client-side echo of the same check `Model_Fields::add()`/
	 * `update()` already enforce server-side.
	 *
	 * `is_text_renderable` (`Field_Type::is_text_renderable()`) is ALSO
	 * exposed here, unlike the rest of this method's own history of only
	 * ever exposing `supports_*`/relationship/choice flags -- needed by
	 * `FieldEditor.jsx`'s own Source Field select (a Permalink field's
	 * own `source_field` setting), which must only ever offer a sibling
	 * field whose type is text-renderable, the exact same eligibility
	 * `Model_Fields::validate_permalink_settings()` enforces server-side
	 * (see that method's own docblock).
	 *
	 * `is_numeric` (`Field_Type::is_numeric()`) is its own close cousin,
	 * `true` only for `Number_Field_Type`/`Range_Field_Type` -- not
	 * currently read by anything in this admin app (unlike
	 * `is_text_renderable`), but the record-CRUD/block-editor side of
	 * this same "which fields am I allowed to offer" question:
	 * `gateway/card-field-number`'s own Field picker and `gateway/datatable`'s
	 * own per-column Number Format button both read it via
	 * `Column_Registry::get_columns_for_collection()`'s own `isNumeric`
	 * (computed from this), not straight from here.
	 *
	 * @return array<int,array{key:string,label:string,category:string,input_type:string,is_sensitive:bool,is_text_renderable:bool,is_numeric:bool,relationship_type:?string,has_choices:bool,is_multiple:?bool,presentation_fields:string[],supports_default_value:bool,supports_character_limit:bool,supports_range_limits:bool,supports_media_settings:bool,supports_file_settings:bool,supports_embed_settings:bool,supports_user_settings:bool,supports_permalink_settings:bool,max_one_per_model:bool}>
	 */
	public static function describe_all() {
		$described = array();

		foreach ( self::all() as $class ) {
			if ( ! class_exists( $class ) ) {
				continue;
			}

			$has_choices = is_subclass_of( $class, Choice_Field_Type::class );

			$described[] = array(
				'key'                         => $class::key(),
				'label'                       => $class::label(),
				'category'                    => $class::category(),
				'input_type'                  => $class::input_type(),
				'is_sensitive'                => $class::is_sensitive(),
				'is_text_renderable'          => $class::is_text_renderable(),
				'is_numeric'                  => $class::is_numeric(),
				'relationship_type'           => is_subclass_of( $class, Relationship_Field_Type::class ) ? $class::relationship_type() : null,
				'has_choices'                 => $has_choices,
				'is_multiple'                 => $has_choices ? $class::is_multiple() : null,
				'presentation_fields'         => $class::presentation_fields(),
				'supports_default_value'      => $class::supports_default_value(),
				'supports_character_limit'    => $class::supports_character_limit(),
				'supports_range_limits'       => $class::supports_range_limits(),
				'supports_media_settings'     => $class::supports_media_settings(),
				'supports_file_settings'      => $class::supports_file_settings(),
				'supports_embed_settings'     => $class::supports_embed_settings(),
				'supports_user_settings'      => $class::supports_user_settings(),
				'supports_permalink_settings' => $class::supports_permalink_settings(),
				'max_one_per_model'           => $class::max_one_per_model(),
			);
		}

		return $described;
	}
}
