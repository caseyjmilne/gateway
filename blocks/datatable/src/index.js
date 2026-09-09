/**
 * Editor registration for the gateway/datatable block.
 *
 * The table itself is always server-rendered (render.php, both on the
 * front end and via <ServerSideRender> in the editor) -- but the block now
 * accepts gateway/facet children (see block.json's providesContext), and
 * InnerBlocks content has to actually be saved into post_content for
 * render.php to receive it as $content, so save() is no longer a no-op.
 */

import { registerBlockType, registerBlockVariation } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );

// See gateway/data-cards' own index.js for the full reasoning: changing
// block.json's own `sourceType` default would silently change already
// -published, never-reconfigured blocks. This `isDefault` variation only
// changes what a FRESHLY INSERTED block starts with -- the registered
// schema used to parse existing content is untouched.
registerBlockVariation( metadata.name, {
	name: 'default-model',
	isDefault: true,
	attributes: { sourceType: 'collection' },
} );
