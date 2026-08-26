/**
 * Editor registration for the gateway/data-cards block.
 *
 * The grid itself is always server-rendered (render.php) -- but the block
 * accepts gateway/data-cards-header/-body/-footer children, and InnerBlocks
 * content has to actually be saved into post_content for render.php to
 * receive it (via $block->inner_blocks), so save() persists that.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
