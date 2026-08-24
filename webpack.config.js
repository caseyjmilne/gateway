/**
 * Custom multi-block webpack config, built on top of @wordpress/scripts'
 * default config.
 *
 * @wordpress/scripts' own auto-discovery expects blocks directly under
 * src/**\/block.json. We instead keep each block self-contained under
 * blocks/<slug>/ (block.json + render.php + build/ living next to a src/
 * directory), so this scans blocks/*\/src for entry points and compiles
 * each block's index.js (editor) and view.js (front end) into that same
 * block's own build/ directory. Dropping a new blocks/<slug>/src/index.js
 * (and optional view.js) in is all a future block needs to be picked up.
 */

const path = require( 'path' );
const fs = require( 'fs' );
const glob = require( 'glob' );
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );

const blocksDir = path.resolve( __dirname, 'blocks' );

const entry = {};

glob.sync( '*/block.json', { cwd: blocksDir } ).forEach( ( relativePath ) => {
	const blockSlug = relativePath.split( '/' )[ 0 ];
	const srcDir = path.join( blocksDir, blockSlug, 'src' );

	[ 'index', 'view' ].forEach( ( entryName ) => {
		const entryFile = path.join( srcDir, `${ entryName }.js` );

		if ( fs.existsSync( entryFile ) ) {
			// e.g. "datatable/build/index" -> blocks/datatable/build/index.js
			entry[ `${ blockSlug }/build/${ entryName }` ] = entryFile;
		}
	} );
} );

module.exports = {
	...defaultConfig,
	entry,
	output: {
		...defaultConfig.output,
		path: blocksDir,
		filename: '[name].js',
		// IMPORTANT: output.path here is the shared `blocks/` directory (so
		// that per-block entries can land in blocks/<slug>/build/), which
		// also contains each block's src/, block.json, and render.php.
		// @wordpress/scripts' default config cleans output.path before
		// every build, which would delete those source files too -- so we
		// disable it here. Run `npm run clean` to clear stale build/
		// output by hand when needed (e.g. after removing an entry file).
		clean: false,
	},
};
