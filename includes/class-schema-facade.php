<?php
/**
 * A tiny stand-in for Laravel's own `Schema` facade, so generated migration
 * files (see Model_Builder) can use the exact familiar
 * `Schema::create(...)`/`Schema::dropIfExists(...)` syntax from real
 * Laravel migrations, without pulling in Laravel's full facade/container
 * system -- this plugin runs Eloquent standalone via Capsule (see
 * Database_Connection::boot_capsule()), which has no service container for
 * `Illuminate\Support\Facades\Schema` to resolve against.
 *
 * Generated model/migration files are written unnamespaced (see
 * Model_Builder's own docblock for why), so their unqualified
 * `Schema::...` calls resolve against the global namespace -- which is
 * exactly where this file defines it (deliberately outside `namespace
 * Gateway;`).
 *
 * @package Gateway
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'Schema', false ) ) {
	class Schema {

		/**
		 * Proxies every call through to Capsule's own schema builder --
		 * Schema::create(), Schema::table(), Schema::dropIfExists(), etc.
		 * all work exactly as they would in a real Laravel migration.
		 *
		 * @param string $method Method name.
		 * @param array  $args   Arguments.
		 * @return mixed
		 */
		public static function __callStatic( $method, $args ) {
			return \Illuminate\Database\Capsule\Manager::schema()->$method( ...$args );
		}
	}
}
