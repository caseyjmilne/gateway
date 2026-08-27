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
	 * @return array<int,array{key:string,label:string,input_type:string,is_sensitive:bool,relationship_type:?string}>
	 */
	public static function describe_all() {
		$described = array();

		foreach ( self::all() as $class ) {
			if ( ! class_exists( $class ) ) {
				continue;
			}

			$described[] = array(
				'key'               => $class::key(),
				'label'             => $class::label(),
				'input_type'        => $class::input_type(),
				'is_sensitive'      => $class::is_sensitive(),
				'relationship_type' => is_subclass_of( $class, Relationship_Field_Type::class ) ? $class::relationship_type() : null,
			);
		}

		return $described;
	}
}
