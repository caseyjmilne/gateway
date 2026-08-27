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
	 * Every registered type's key/label/input_type -- what the admin
	 * app's Field Editor and record CRUD forms need to build a type
	 * dropdown and know which kind of <input> to render, without
	 * duplicating that knowledge in JavaScript.
	 *
	 * @return array<int,array{key:string,label:string,input_type:string}>
	 */
	public static function describe_all() {
		$described = array();

		foreach ( self::all() as $class ) {
			if ( ! class_exists( $class ) ) {
				continue;
			}

			$described[] = array(
				'key'        => $class::key(),
				'label'      => $class::label(),
				'input_type' => $class::input_type(),
			);
		}

		return $described;
	}
}
