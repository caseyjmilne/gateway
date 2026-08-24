<?php
/**
 * Plugin Name:       Gateway
 * Plugin URI:        https://github.com/caseyjmilne/gateway
 * Description:       Custom Gutenberg blocks for Gateway, starting with a sortable/filterable DataTable grid block.
 * Version:           0.1.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Gateway
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       gateway
 *
 * @package Gateway
 */

defined( 'ABSPATH' ) || exit;

define( 'GATEWAY_VERSION', '0.1.0' );
define( 'GATEWAY_PLUGIN_FILE', __FILE__ );
define( 'GATEWAY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GATEWAY_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'GATEWAY_BLOCKS_DIR', GATEWAY_PLUGIN_DIR . 'blocks' );

require_once GATEWAY_PLUGIN_DIR . 'includes/class-block-loader.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-column-registry.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-columns-rest-controller.php';

/**
 * Boot the plugin.
 */
function gateway_boot() {
	\Gateway\Block_Loader::init();
	\Gateway\Column_Registry::init();
	\Gateway\Columns_REST_Controller::init();
}
add_action( 'plugins_loaded', 'gateway_boot' );
