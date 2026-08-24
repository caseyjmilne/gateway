/**
 * Editor registration for the gateway/datatable block.
 *
 * This is a dynamic block: markup always comes from render.php (via
 * <ServerSideRender> in the editor, and directly on the front end), so
 * save() intentionally returns null -- there is nothing for WP to persist
 * into post_content besides the block's attributes/comment delimiter.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
