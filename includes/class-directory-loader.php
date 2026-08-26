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
			$before = get_declared_classes();

			require_once $file;

			$new_classes = array_diff( get_declared_classes(), $before );

			foreach ( $new_classes as $class ) {
				$registry_class::register( $class );
			}
		}
	}
}
