<?php
/**
 * Discovers and registers every block that lives under /blocks.
 *
 * Each block is a self-contained directory (blocks/<slug>/) with its own
 * block.json, compiled assets (build/), and optional render.php. Dropping a
 * new block directory in place is enough for it to be picked up on the next
 * request -- nothing else in PHP needs to change as more blocks (including
 * child blocks of the datatable block) are added.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Block_Loader {

	/**
	 * Hook block registration into WordPress.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register_blocks' ) );
		add_filter( 'block_categories_all', array( __CLASS__, 'register_category' ) );
	}

	/**
	 * Registers a dedicated "Gateway" block category -- every TOP-LEVEL
	 * block this plugin ships (the one a site owner actually starts a
	 * layout with: gateway/data-cards, gateway/data-display,
	 * gateway/datatable, gateway/single-record) sets its own block.json
	 * `category` to this slug, rather than the generic core "widgets"
	 * category they used to share with every other plugin's own
	 * non-top-level blocks -- so the inserter has one obvious place to
	 * find them, instead of hunting through Widgets for four blocks among
	 * many unrelated ones.
	 *
	 * Deliberately NOT applied to any of this plugin's own CHILD blocks
	 * (gateway/datatable-header, gateway/card-field-text, etc. -- every
	 * block.json with its own `parent`/`ancestor` restriction) -- those
	 * are never something a site owner picks off the top-level inserter
	 * list to begin with, only ever reachable already nested inside one
	 * of the four blocks above, so grouping them under "Gateway" too
	 * would just be dead weight in a category no one browses looking for
	 * them.
	 *
	 * Prepended, not appended -- `register_block_type()` reads `category`
	 * from each block's own block.json regardless of where "gateway"
	 * itself sits in this list, but the inserter's own "Blocks" panel
	 * lists categories (each with a "Browse all" link) in the order this
	 * array returns them, and a plugin whose main working blocks live in
	 * their own category is worth surfacing before core's own Text/
	 * Media/Design groupings, not buried below them.
	 *
	 * @param array $categories Every already-registered category, core's
	 *                           own included.
	 * @return array
	 */
	public static function register_category( $categories ) {
		return array_merge(
			array(
				array(
					'slug'  => 'gateway',
					'title' => __( 'Gateway', 'gateway' ),
					'icon'  => null,
				),
			),
			$categories
		);
	}

	/**
	 * Scan the /blocks directory and register every block found there.
	 *
	 * A block is only registered if its directory contains a block.json
	 * file -- register_block_type() reads that file (and the compiled
	 * assets/dependencies it points to) to wire up editor scripts, styles,
	 * and any PHP render callback automatically.
	 */
	public static function register_blocks() {
		if ( ! is_dir( GATEWAY_BLOCKS_DIR ) ) {
			return;
		}

		$block_dirs = glob( GATEWAY_BLOCKS_DIR . '/*', GLOB_ONLYDIR );

		if ( empty( $block_dirs ) ) {
			return;
		}

		foreach ( $block_dirs as $block_dir ) {
			if ( file_exists( $block_dir . '/block.json' ) ) {
				register_block_type( $block_dir );
			}
		}
	}
}
