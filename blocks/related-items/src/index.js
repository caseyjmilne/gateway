/**
 * Editor registration for the gateway/related-items block.
 *
 * Structurally the same as gateway/data-cards-body: a real, editable
 * InnerBlocks template (edited against one specific related record at a
 * time -- see edit.js), always server-rendered into the actual repeated
 * list on the front end (render.php). save() persists the real
 * InnerBlocks, same reasoning as that block's own index.js.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
