<?php
/**
 * Loads every PHP file in a directory and registers whatever class it
 * defines -- how Gateway picks up the model/migration classes Model_Builder
 * writes to wp-content/gateway/models and wp-content/gateway/migrations.
 * One generic implementation shared by both (rather than two near-identical
 * copies), parameterized by which directory and which Registry subclass to
 * register into.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Directory_Loader {

	/**
	 * @param string $dir            Directory to scan (non-recursive).
	 * @param string $registry_class Fully-qualified Registry subclass
	 *                                 (Model_Registry::class or
	 *                                 Migration_Registry::class) to
	 *                                 register() each discovered class
	 *                                 into.
	 */
	public static function load( $dir, $registry_class ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}

		$files = glob( trailingslashit( $dir ) . '*.php' );

		if ( ! $files ) {
			return;
		}

		sort( $files ); // Migration filenames are version-prefixed -- load in that order.

		foreach ( $files as $file ) {
			// Diffing get_declared_classes() before/after -- rather than
			// guessing a class name from the file name -- is what makes
			// this loader work regardless of how a file is named; the only
			// real requirement on a generated file is that it declares
			// exactly the one class it's meant to.
			//
			// That diff isn't only the file's own class, though: the very
			// first time any generated file `extends`/`implements` a class
			// Composer's autoloader hasn't loaded yet in this request
			// (e.g. `\Illuminate\Database\Migrations\Migration`, on the
			// first migration file `require_once` in a fresh process),
			// PHP autoloads that PARENT as a side effect of parsing this
			// one -- which then shows up as "newly declared" too, even
			// though this file didn't define it. Left unfiltered, that
			// autoloaded parent gets passed to register() right alongside
			// the real class, and fails its own is_subclass_of() check
			// against itself (logged as a `_doing_it_wrong()` notice,
			// repeating on every request that hits this code path before
			// something ELSE happens to warm that autoload first).
			// ReflectionClass::getFileName() is what actually tells the
			// two apart: the real class is declared IN $file; an
			// autoloaded parent is declared in whatever vendor file
			// defines IT instead.
			$before = get_declared_classes();

			require_once $file;

			$new_classes  = array_diff( get_declared_classes(), $before );
			$real_file    = realpath( $file );

			foreach ( $new_classes as $class ) {
				$declared_in = ( new \ReflectionClass( $class ) )->getFileName();

				if ( false === $declared_in || realpath( $declared_in ) !== $real_file ) {
					continue;
				}

				$registry_class::register( $class );
			}
		}
	}
}
