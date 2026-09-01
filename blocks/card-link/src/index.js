/**
 * Editor registration for the gateway/card-link block.
 *
 * A dynamic block -- render.php builds the actual `<a>` (or no wrapper
 * at all, when there's no permalink to link to) on every request, so
 * save() only needs to persist the real InnerBlocks for storage, same
 * reasoning as every other dynamic InnerBlocks wrapper in this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
