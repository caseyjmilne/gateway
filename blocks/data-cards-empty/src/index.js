/**
 * Editor registration for the gateway/data-cards-empty block.
 *
 * A dynamic InnerBlocks wrapper -- render.php echoes $content as-is,
 * conditionally hidden by a class based on the current recordsTotal (see
 * that file's own docblock) -- so save() only needs to persist the
 * InnerBlocks placeholder + wrapper markup, same shape as gateway/
 * data-cards-header/-footer's own index.js.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
