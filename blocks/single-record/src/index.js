/**
 * Editor registration for the gateway/single-record block.
 *
 * A dynamic block -- render.php simply passes InnerBlocks content
 * straight through, no re-validation of its own (see that file's own
 * docblock for why), so save() only needs to persist the real
 * InnerBlocks for storage/parsing, same reasoning as every other dynamic
 * InnerBlocks block in this plugin.
 *
 * Also registers the "Gateway Template" sidebar panel
 * (`./template-panel`) -- bundled here, not a separate build entry,
 * since WordPress already enqueues this block's own `editorScript`
 * unconditionally in every block editor screen (see that file's own
 * docblock for why that's exactly what a document-settings panel needs).
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';
import './template-panel';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
