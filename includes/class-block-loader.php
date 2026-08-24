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
