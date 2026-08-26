<?php
/**
 * The list of every Eloquent model class Gateway (or a future integration
 * relying on this plugin) knows about -- e.g. for a future admin screen
 * listing available models, or block editor code offering "which model"
 * as a data source alongside post types. See Registry for the actual
 * register()/all()/has() implementation this shares with Migration_Registry.
 *
 * Registering a model is a single call, typically made right after its
 * class is defined:
 *
 *     class Widget extends \Illuminate\Database\Eloquent\Model {
 *         // ...
 *     }
 *     \Gateway\Model_Registry::register( Widget::class );
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Registry extends Registry {

	/**
	 * @inheritDoc
	 */
	protected static function registry_key() {
		return 'model';
	}

	/**
	 * @inheritDoc
	 */
	protected static function required_base() {
		return '\Illuminate\Database\Eloquent\Model';
	}
}
