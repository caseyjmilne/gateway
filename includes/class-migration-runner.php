<?php
/**
 * Runs a single migration and remembers that it ran -- the "version
 * number" every generated migration carries (see Model_Builder) is what
 * makes that possible: it's the identity check() uses to know whether a
 * given migration still needs running, and (via latest_ran_version()/
 * latest_registered_version()) will be what a future "run pending
 * migrations" admin screen uses to know whether the app is fully
 * up to date.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Migration_Runner {

	/**
	 * Option name the log of already-run migration versions is stored
	 * under: version number => array{class, ran_at}.
	 */
	const OPTION_RAN = 'gateway_ran_migrations';

	/**
	 * @param int $version Migration version number.
	 * @return bool
	 */
	public static function has_run( $version ) {
		$ran = get_option( self::OPTION_RAN, array() );
		return isset( $ran[ $version ] );
	}

	/**
	 * Run a migration's up() method and record it as run. Idempotent: a
	 * migration whose version has already run is treated as an immediate
	 * success without calling up() again.
	 *
	 * @param string $migration_class Fully-qualified migration class name
	 *                                 (must extend
	 *                                 \Illuminate\Database\Migrations\Migration
	 *                                 and declare a public $version).
	 * @return true|\WP_Error
	 */
	public static function run( $migration_class ) {
		if ( ! class_exists( $migration_class ) ) {
			return new \WP_Error(
				'gateway_migration_missing',
				sprintf( __( 'Migration class "%s" does not exist.', 'gateway' ), $migration_class ),
				array( 'status' => 500 )
			);
		}

		$migration = new $migration_class();
		$version   = isset( $migration->version ) ? $migration->version : null;

		if ( null === $version ) {
			return new \WP_Error(
				'gateway_migration_no_version',
				sprintf( __( 'Migration class "%s" has no $version property.', 'gateway' ), $migration_class ),
				array( 'status' => 500 )
			);
		}

		if ( self::has_run( $version ) ) {
			return true;
		}

		try {
			$migration->up();
		} catch ( \Throwable $e ) {
			return new \WP_Error(
				'gateway_migration_failed',
				$e->getMessage(),
				array( 'status' => 500 )
			);
		}

		$ran               = get_option( self::OPTION_RAN, array() );
		$ran[ $version ]   = array(
			'class'  => $migration_class,
			'ran_at' => time(),
		);
		update_option( self::OPTION_RAN, $ran );

		return true;
	}

	/**
	 * The highest version number actually run so far, or 0 if none have.
	 *
	 * @return int
	 */
	public static function latest_ran_version() {
		$ran = get_option( self::OPTION_RAN, array() );
		return empty( $ran ) ? 0 : max( array_keys( $ran ) );
	}

	/**
	 * The highest version number among every currently-registered
	 * migration, whether or not it has run -- for comparing against
	 * latest_ran_version() to know if anything is pending.
	 *
	 * @return int
	 */
	public static function latest_registered_version() {
		$max = 0;

		foreach ( Migration_Registry::all() as $class ) {
			if ( ! class_exists( $class ) ) {
				continue;
			}

			$instance = new $class();

			if ( isset( $instance->version ) && $instance->version > $max ) {
				$max = $instance->version;
			}
		}

		return $max;
	}

	/**
	 * Whether every registered migration has already been run.
	 *
	 * @return bool
	 */
	public static function is_up_to_date() {
		return self::latest_ran_version() >= self::latest_registered_version();
	}
}
