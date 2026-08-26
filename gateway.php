<?php
/**
 * Plugin Name:       Gateway
 * Plugin URI:        https://github.com/caseyjmilne/gateway
 * Description:       Custom Gutenberg blocks for Gateway, starting with a sortable/filterable DataTable grid block.
 * Version:           0.1.0
 * Requires at least: 6.3
 * Requires PHP:      8.2
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
define( 'GATEWAY_ADMIN_APP_DIR', GATEWAY_PLUGIN_DIR . 'admin-app' );
define( 'GATEWAY_ADMIN_APP_URL', GATEWAY_PLUGIN_URL . 'admin-app' );
// Deliberately outside the plugin's own directory (unlike everything
// above) -- generated model/migration source files are user data, not
// plugin code, and belong somewhere that survives a plugin update/
// reinstall the same way uploads do. See Model_Builder.
define( 'GATEWAY_DATA_DIR', WP_CONTENT_DIR . '/gateway' );
define( 'GATEWAY_MODELS_DIR', GATEWAY_DATA_DIR . '/models' );
define( 'GATEWAY_MIGRATIONS_DIR', GATEWAY_DATA_DIR . '/migrations' );

// Vendored Composer dependencies (Illuminate/Eloquent, Carbon, etc. -- see
// README.md's "Laravel Models (Illuminate/Eloquent)" section). Committed to
// the repo so a site installing this plugin never needs to run Composer
// itself; guarded because a future packaging step or a git-sparse checkout
// could omit it without breaking the rest of the plugin.
if ( file_exists( GATEWAY_PLUGIN_DIR . 'vendor/autoload.php' ) ) {
	require_once GATEWAY_PLUGIN_DIR . 'vendor/autoload.php';
	require_once GATEWAY_PLUGIN_DIR . 'includes/class-schema-facade.php';
}

/**
 * Create wp-content/gateway/{models,migrations} on activation, so they're
 * ready before the first model is ever added. Model_Builder also creates
 * them defensively at save time as a fallback, but doing it here too means
 * a site can see (and, if it wants, pre-populate) the directories
 * immediately after activating, not only after first use.
 */
function gateway_activate() {
	wp_mkdir_p( GATEWAY_MODELS_DIR );
	wp_mkdir_p( GATEWAY_MIGRATIONS_DIR );
}
register_activation_hook( __FILE__, 'gateway_activate' );

require_once GATEWAY_PLUGIN_DIR . 'includes/class-block-loader.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-column-registry.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-columns-rest-controller.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-facet-query.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-data-cards-renderer.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-data-cards-rest-controller.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-database-connection.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-database-rest-controller.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-admin-page.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-registry.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-model-registry.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-migration-registry.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-directory-loader.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-migration-runner.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-model-builder.php';
require_once GATEWAY_PLUGIN_DIR . 'includes/class-model-rest-controller.php';

/**
 * Boot the plugin.
 */
function gateway_boot() {
	\Gateway\Block_Loader::init();
	\Gateway\Column_Registry::init();
	\Gateway\Columns_REST_Controller::init();
	\Gateway\Facet_Query::init();
	// Data_Cards_Renderer is a pure static helper with no hooks of its own
	// (see its own docblock) -- required above, but nothing to init() here.
	\Gateway\Data_Cards_REST_Controller::init();
	\Gateway\Database_REST_Controller::init();
	// Registers (but doesn't connect -- Capsule resolves lazily on first
	// query) the same PDO connection Database_REST_Controller tests, so any
	// future Laravel model class can `extends Model` immediately.
	\Gateway\Database_Connection::boot_capsule();
	\Gateway\Admin_Page::init();
	\Gateway\Model_REST_Controller::init();

	// Pick up every model/migration class living in wp-content/gateway --
	// requiring each file and registering whatever class it declares (see
	// Directory_Loader) -- before the extensibility hooks below, so a
	// model/migration added some other way can still see (via has()) what
	// already exists on disk.
	\Gateway\Directory_Loader::load( GATEWAY_MODELS_DIR, \Gateway\Model_Registry::class );
	\Gateway\Directory_Loader::load( GATEWAY_MIGRATIONS_DIR, \Gateway\Migration_Registry::class );

	// Gives model/migration classes defined some other way (not generated
	// into wp-content/gateway by Model_Builder) a fixed point in the
	// request lifecycle to call Model_Registry::register()/
	// Migration_Registry::register() -- fired after boot_capsule() above,
	// so Eloquent is already usable by the time anything registered here
	// gets touched.
	do_action( 'gateway_register_models' );
	do_action( 'gateway_register_migrations' );
}
add_action( 'plugins_loaded', 'gateway_boot' );
