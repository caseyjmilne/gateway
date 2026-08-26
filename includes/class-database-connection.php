<?php
/**
 * A PDO connection to the *same* database WordPress itself uses, kept
 * entirely separate from $wpdb (which talks mysqli, not PDO) -- this is
 * what Laravel-style Eloquent models will run their queries through, once
 * actual model classes exist (see README.md's "Laravel Models
 * (Illuminate/Eloquent)" section for the vendored `illuminate/database`
 * package this connects to via Capsule).
 *
 * Connection settings are copied from the same wp-config.php constants
 * $wpdb itself was built from ($wpdb->parse_db_host() is reused rather than
 * re-implementing WordPress's own host/port/socket parsing), with one
 * addition: a site owner can override just the port via the Gateway admin
 * screen, stored as a plugin option. This matters in practice because a
 * database server is often reachable on a non-default port (a Docker
 * container mapping MySQL to something other than 3306 is the common case)
 * even though $wpdb happily keeps using whatever DB_HOST already resolves
 * to for its own mysqli connection.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Database_Connection {

	/**
	 * Option name the custom port override is stored under. Empty/absent
	 * means "use whatever port DB_HOST resolves to (or 3306)".
	 */
	const OPTION_CUSTOM_PORT = 'gateway_db_custom_port';

	/**
	 * Fallback MySQL port when DB_HOST doesn't specify one and no custom
	 * override is stored.
	 */
	const DEFAULT_PORT = '3306';

	/**
	 * PDO connection timeout, in seconds. WordPress's own DB_HOST can point
	 * at an unreachable host/port (wrong custom port, a Docker container
	 * that isn't up, a firewalled host), and PDO's own default connect
	 * timeout is effectively PHP's socket default -- often 30+ seconds.
	 * Kept short here so a "Test Connection" click in the admin screen
	 * fails fast instead of hanging the request.
	 */
	const CONNECT_TIMEOUT = 3;

	/**
	 * Transient key the last health check result (see check()) is cached
	 * under.
	 */
	const CACHE_KEY = 'gateway_db_health';

	/**
	 * Default cache lifetime, in seconds, for check()/is_healthy() -- once
	 * a check (successful or not) has run, its result is presumed current
	 * for this long rather than re-checking on every call. Kept fairly
	 * long: a working database connection essentially never becomes
	 * unreachable moment-to-moment on its own, so there's little value in
	 * re-checking often -- filterable (gateway_db_health_cache_ttl) for a
	 * site that wants tighter or looser staleness.
	 */
	const CACHE_TTL = 15 * MINUTE_IN_SECONDS;

	/**
	 * Resolve the connection settings to use, copied from the same
	 * wp-config.php constants $wpdb itself connects with.
	 *
	 * @param array $overrides Optional one-off overrides, currently only
	 *                          'port' is recognized. Used by the "test with
	 *                          this port" flow so a value can be tried
	 *                          before (or without ever) being saved.
	 * @return array{host:string,port:string,unix_socket:string,database:string,username:string,password:string,charset:string,collation:string,prefix:string}
	 */
	public static function get_config( array $overrides = array() ) {
		global $wpdb;

		list( $host, $parsed_port, $socket, $is_ipv6 ) = $wpdb->parse_db_host( DB_HOST );

		$host = $is_ipv6 ? '[' . $host . ']' : (string) $host;

		$override_port = isset( $overrides['port'] ) ? trim( (string) $overrides['port'] ) : '';
		$stored_port   = trim( (string) get_option( self::OPTION_CUSTOM_PORT, '' ) );
		$effective_port_override = '' !== $override_port ? $override_port : $stored_port;

		// A stored/requested port override means the site owner is explicitly
		// pointing at a TCP endpoint -- prefer that over a socket DB_HOST
		// would otherwise resolve to (matches $wpdb's own default behavior
		// only in the absence of an override).
		$use_socket = ! empty( $socket ) && '' === $effective_port_override;

		$port = '';
		if ( ! $use_socket ) {
			$port = '' !== $effective_port_override ? $effective_port_override : ( $parsed_port ? (string) $parsed_port : self::DEFAULT_PORT );

			// MySQL client libraries treat the literal host "localhost" as
			// "connect via unix socket", silently ignoring any port -- so
			// when a port override is actually in effect, force a real TCP
			// connection by using the loopback IP instead. Without this, a
			// custom port would appear to have no effect at all on the
			// (very common) DB_HOST=localhost setup.
			if ( '' !== $effective_port_override && 'localhost' === strtolower( $host ) ) {
				$host = '127.0.0.1';
			}
		}

		return array(
			'host'        => $host,
			'port'        => $port,
			'unix_socket' => $use_socket ? (string) $socket : '',
			'database'    => DB_NAME,
			'username'    => DB_USER,
			'password'    => DB_PASSWORD,
			'charset'     => ! empty( $wpdb->charset ) ? $wpdb->charset : 'utf8mb4',
			'collation'   => ! empty( $wpdb->collate ) ? $wpdb->collate : 'utf8mb4_unicode_ci',
			'prefix'      => $wpdb->prefix,
		);
	}

	/**
	 * The subset of get_config() safe to expose to the admin screen --
	 * never the password.
	 *
	 * @param array $config As returned by get_config().
	 * @return array
	 */
	public static function public_config( array $config ) {
		return array(
			'host'        => $config['host'],
			'port'        => $config['port'],
			'unix_socket' => $config['unix_socket'],
			'database'    => $config['database'],
			'username'    => $config['username'],
			'prefix'      => $config['prefix'],
		);
	}

	/**
	 * Save (or, given an empty string, clear) the custom port override.
	 *
	 * @param string $port Digits only, 1-65535; empty string clears the
	 *                      override back to the DB_HOST-resolved default.
	 * @return bool True on success, false if $port is neither empty nor a
	 *              valid port number (nothing is saved in that case).
	 */
	public static function set_custom_port( $port ) {
		$port = trim( (string) $port );

		if ( '' === $port ) {
			delete_option( self::OPTION_CUSTOM_PORT );
			self::clear_cache();
			return true;
		}

		if ( ! ctype_digit( $port ) || (int) $port < 1 || (int) $port > 65535 ) {
			return false;
		}

		update_option( self::OPTION_CUSTOM_PORT, $port );
		// The cached health check was for the old port -- it says nothing
		// about whether this new one works, so it can't be presumed valid
		// any more.
		self::clear_cache();
		return true;
	}

	/**
	 * Open a PDO connection using get_config()'s settings.
	 *
	 * @param array $overrides Passed through to get_config().
	 * @return \PDO
	 * @throws \PDOException If the connection fails.
	 */
	public static function connect( array $overrides = array() ) {
		$config = self::get_config( $overrides );

		$dsn_parts = array();

		if ( ! empty( $config['unix_socket'] ) ) {
			$dsn_parts[] = 'unix_socket=' . $config['unix_socket'];
		} else {
			$dsn_parts[] = 'host=' . $config['host'];
			if ( ! empty( $config['port'] ) ) {
				$dsn_parts[] = 'port=' . $config['port'];
			}
		}

		$dsn_parts[] = 'dbname=' . $config['database'];
		$dsn_parts[] = 'charset=' . $config['charset'];

		$dsn = 'mysql:' . implode( ';', $dsn_parts );

		return new \PDO(
			$dsn,
			$config['username'],
			$config['password'],
			array(
				\PDO::ATTR_TIMEOUT => self::CONNECT_TIMEOUT,
				\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
			)
		);
	}

	/**
	 * Attempt a connection and report the result -- never throws. This is
	 * always a live check; see check() for the cached version most callers
	 * outside the admin screen's own "Test Connection" button should use
	 * instead.
	 *
	 * @param array $overrides Passed through to get_config()/connect().
	 * @return array{success:bool,message:string,latency_ms:?int,checked_at:int,config:array}
	 */
	public static function test( array $overrides = array() ) {
		$config = self::get_config( $overrides );

		if ( ! extension_loaded( 'pdo_mysql' ) ) {
			return array(
				'success'    => false,
				'message'    => __( 'The pdo_mysql PHP extension is not available on this server.', 'gateway' ),
				'latency_ms' => null,
				'checked_at' => time(),
				'config'     => self::public_config( $config ),
			);
		}

		$started = microtime( true );

		try {
			$pdo = self::connect( $overrides );
			$pdo->query( 'SELECT 1' );

			return array(
				'success'    => true,
				'message'    => __( 'Connection successful.', 'gateway' ),
				'latency_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
				'checked_at' => time(),
				'config'     => self::public_config( $config ),
			);
		} catch ( \PDOException $e ) {
			return array(
				'success'    => false,
				'message'    => $e->getMessage(),
				'latency_ms' => (int) round( ( microtime( true ) - $started ) * 1000 ),
				'checked_at' => time(),
				'config'     => self::public_config( $config ),
			);
		}
	}

	/**
	 * Filters how long (in seconds) check()'s result is cached before a
	 * live check runs again.
	 *
	 * @return int Seconds.
	 */
	public static function cache_ttl() {
		/**
		 * Filters Database_Connection's health-check cache lifetime.
		 *
		 * @param int $ttl Seconds. Default 900 (15 minutes).
		 */
		return (int) apply_filters( 'gateway_db_health_cache_ttl', self::CACHE_TTL );
	}

	/**
	 * test(), but cached: once a check has run, its result (success or
	 * failure alike) is presumed current for cache_ttl() seconds rather
	 * than opening a fresh connection on every call -- a working database
	 * connection essentially never becomes unreachable moment-to-moment on
	 * its own, so there's little value in re-testing on every request the
	 * way test() itself does.
	 *
	 * @param array $overrides Passed through to test(). A non-empty
	 *                          $overrides always bypasses the cache
	 *                          entirely (neither read nor written) --
	 *                          it represents a one-off, not-yet-persisted
	 *                          config (e.g. "try this port before saving
	 *                          it"), and caching that under the one shared
	 *                          cache key would risk a later default-config
	 *                          check incorrectly reusing someone else's
	 *                          one-off result.
	 * @param bool  $force     True to skip the cached value and check
	 *                          live (still re-populating the cache
	 *                          afterward) -- used by the admin screen's
	 *                          own "Test Connection" button, which should
	 *                          always reflect a fresh check.
	 * @return array Same shape as test(), plus 'cached' (bool).
	 */
	public static function check( array $overrides = array(), $force = false ) {
		if ( ! empty( $overrides ) ) {
			$result           = self::test( $overrides );
			$result['cached'] = false;
			return $result;
		}

		if ( ! $force ) {
			$cached = get_transient( self::CACHE_KEY );

			if ( is_array( $cached ) ) {
				$cached['cached'] = true;
				return $cached;
			}
		}

		$result = self::test();
		set_transient( self::CACHE_KEY, $result, self::cache_ttl() );

		$result['cached'] = false;
		return $result;
	}

	/**
	 * Convenience boolean wrapper around check() -- for future call sites
	 * (e.g. a Laravel model's caller wanting to fail gracefully) that only
	 * care whether the connection is currently presumed good, not the full
	 * detail check()/test() return.
	 *
	 * @param bool $force Passed through to check().
	 * @return bool
	 */
	public static function is_healthy( $force = false ) {
		$result = self::check( array(), $force );
		return ! empty( $result['success'] );
	}

	/**
	 * Discard the cached health check result, so the next check()/
	 * is_healthy() call re-checks live regardless of cache_ttl().
	 */
	public static function clear_cache() {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * The same settings as get_config(), reshaped into an Illuminate
	 * "connections" array entry -- ready to hand to
	 * Capsule::addConnection() so Eloquent models can use this connection.
	 * Shape matches Laravel's own database.php config format exactly.
	 *
	 * @param array $overrides Passed through to get_config().
	 * @return array
	 */
	public static function get_capsule_config( array $overrides = array() ) {
		$config = self::get_config( $overrides );

		return array(
			'driver'      => 'mysql',
			'host'        => $config['host'],
			'port'        => $config['port'],
			'database'    => $config['database'],
			'username'    => $config['username'],
			'password'    => $config['password'],
			'unix_socket' => $config['unix_socket'],
			'charset'     => $config['charset'],
			'collation'   => $config['collation'],
			'prefix'      => $config['prefix'],
			'strict'      => true,
			'engine'      => null,
			'options'     => extension_loaded( 'pdo_mysql' ) ? array_filter(
				array(
					\PDO::ATTR_TIMEOUT => self::CONNECT_TIMEOUT,
				)
			) : array(),
		);
	}

	/**
	 * Register this connection with Eloquent's Capsule manager and boot it,
	 * so any future Laravel model class can simply `extends Model` and
	 * query -- no per-model setup needed. Safe to call on every request:
	 * Capsule::addConnection() doesn't itself touch the database, it only
	 * registers connection settings that are resolved lazily on first
	 * actual query.
	 *
	 * No-ops if the vendored illuminate/database package isn't present
	 * (mirrors gateway.php's own file_exists() guard around
	 * vendor/autoload.php) or if this has already run once.
	 */
	public static function boot_capsule() {
		static $booted = false;

		if ( $booted || ! class_exists( '\Illuminate\Database\Capsule\Manager' ) ) {
			return;
		}

		$booted = true;

		$capsule = new \Illuminate\Database\Capsule\Manager();
		$capsule->addConnection( self::get_capsule_config(), 'wordpress' );
		$capsule->setAsGlobal();
		$capsule->bootEloquent();
	}
}
