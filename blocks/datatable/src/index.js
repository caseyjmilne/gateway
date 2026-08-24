/**
 * Editor registration for the gateway/datatable block.
 *
 * The table itself is always server-rendered (render.php, both on the
 * front end and via <ServerSideRender> in the editor) -- but the block now
 * accepts gateway/facet children (see block.json's providesContext), and
 * InnerBlocks content has to actually be saved into post_content for
 * render.php to receive it as $content, so save() is no longer a no-op.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
