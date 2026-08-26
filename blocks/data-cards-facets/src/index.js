/**
 * Editor registration for the gateway/data-cards-facets block.
 *
 * A dynamic, single-slot InnerBlocks wrapper -- render.php echoes $content
 * as-is (see its own docblock), so save() only needs to persist the
 * InnerBlocks placeholder + wrapper markup.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
