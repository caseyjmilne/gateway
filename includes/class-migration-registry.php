<?php
/**
 * The list of every database migration class Gateway (or a future
 * integration relying on this plugin) knows about -- e.g. for a future
 * "run pending migrations" admin action. See Registry for the actual
 * register()/all()/has() implementation this shares with Model_Registry.
 *
 * Registering a migration is a single call, typically made right after
 * its class is defined:
 *
 *     class CreateWidgetsTable extends \Illuminate\Database\Migrations\Migration {
 *         public function up() { ... }
 *         public function down() { ... }
 *     }
 *     \Gateway\Migration_Registry::register( CreateWidgetsTable::class );
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Migration_Registry extends Registry {

	/**
	 * @inheritDoc
	 */
	protected static function registry_key() {
		return 'migration';
	}

	/**
	 * @inheritDoc
	 */
	protected static function required_base() {
		return '\Illuminate\Database\Migrations\Migration';
	}
}
