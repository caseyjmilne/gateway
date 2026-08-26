<?php
/**
 * Shared implementation behind Model_Registry and Migration_Registry --
 * both are, mechanically, the exact same thing: a simple list of "classes
 * of this kind that exist in the app", built up by explicit register()
 * calls rather than any kind of directory scanning/autodiscovery. Various
 * future consumers (block render code, the admin app's backend, migration
 * -running code) will want "all registered models" or "all registered
 * migrations" without caring where each one came from -- that's what this
 * gives both a single, tested implementation of.
 *
 * A subclass only needs to say two things: what to call its own list
 * (registry_key()) and what every class registered under it must actually
 * be (required_base()) -- see Model_Registry/Migration_Registry
 * themselves, both a handful of lines.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

abstract class Registry {

	/**
	 * Every subclass's registered classes, keyed first by that subclass's
	 * own registry_key() and then by fully-qualified class name (so
	 * registering the same class twice is a no-op, not a duplicate entry).
	 *
	 * Deliberately a single array shared across all subclasses (rather
	 * than each subclass redeclaring its own `protected static $items`)
	 * -- PHP static properties are only duplicated per subclass when the
	 * subclass itself redeclares them; inheriting one silently as-is would
	 * make Model_Registry and Migration_Registry share one underlying
	 * list. Bucketing by registry_key() here sidesteps that entirely.
	 *
	 * @var array<string,array<string,string>>
	 */
	private static $registered = array();

	/**
	 * This subclass's own bucket name in the shared $registered array --
	 * e.g. 'model', 'migration'. Must be unique per subclass.
	 *
	 * @return string
	 */
	abstract protected static function registry_key();

	/**
	 * The class or interface every class registered under this subclass
	 * must extend/implement, checked with is_subclass_of() -- e.g.
	 * Illuminate\Database\Eloquent\Model for Model_Registry. Return an
	 * empty string to accept anything (not currently used by either
	 * concrete registry, but keeps this base class usable for a future
	 * one that doesn't want the check).
	 *
	 * @return string
	 */
	abstract protected static function required_base();

	/**
	 * Register a class.
	 *
	 * Accepts either the class itself (the idiomatic way -- e.g.
	 * `Model_Registry::register( Widget::class )`) or an instance of it
	 * (`Model_Registry::register( new Widget() )`) -- neither actually
	 * instantiates anything on your behalf; passing an object just reads
	 * its class name back out via get_class(). Nothing about registering
	 * a model requires a live database connection, so this never touches
	 * one.
	 *
	 * @param string|object $class Fully-qualified class name, or an
	 *                              instance of it.
	 * @return bool True once registered (including if it already was),
	 *              false if $class doesn't exist or doesn't extend/
	 *              implement required_base() -- logged via
	 *              _doing_it_wrong() rather than fatally erroring, since a
	 *              misregistered class shouldn't be able to take down
	 *              every other already-registered one.
	 */
	public static function register( $class ) {
		$class_name = is_object( $class ) ? get_class( $class ) : (string) $class;

		if ( ! class_exists( $class_name ) ) {
			_doing_it_wrong(
				static::class . '::register',
				sprintf( 'Class "%s" does not exist.', $class_name ),
				'0.1.0'
			);
			return false;
		}

		$required_base = static::required_base();

		if ( '' !== $required_base && ! is_subclass_of( $class_name, $required_base ) ) {
			_doing_it_wrong(
				static::class . '::register',
				sprintf( 'Class "%s" must extend or implement "%s".', $class_name, $required_base ),
				'0.1.0'
			);
			return false;
		}

		self::$registered[ static::registry_key() ][ $class_name ] = $class_name;

		return true;
	}

	/**
	 * Remove a previously-registered class. Silently does nothing if it
	 * was never registered.
	 *
	 * @param string|object $class Fully-qualified class name, or an
	 *                              instance of it.
	 */
	public static function unregister( $class ) {
		$class_name = is_object( $class ) ? get_class( $class ) : (string) $class;

		unset( self::$registered[ static::registry_key() ][ $class_name ] );
	}

	/**
	 * Every class currently registered under this subclass.
	 *
	 * @return string[] Fully-qualified class names, in registration order.
	 */
	public static function all() {
		return array_values( self::$registered[ static::registry_key() ] ?? array() );
	}

	/**
	 * @param string|object $class Fully-qualified class name, or an
	 *                              instance of it.
	 * @return bool
	 */
	public static function has( $class ) {
		$class_name = is_object( $class ) ? get_class( $class ) : (string) $class;

		return isset( self::$registered[ static::registry_key() ][ $class_name ] );
	}

	/**
	 * @return int
	 */
	public static function count() {
		return count( self::$registered[ static::registry_key() ] ?? array() );
	}
}
