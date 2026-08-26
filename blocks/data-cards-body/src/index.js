/**
 * Editor registration for the gateway/data-cards-body block.
 *
 * The one block in this family with a real editing UX of its own: a
 * single, user-authored card template, edited in place against a live
 * post (useBlockPreview/BlockContextProvider -- see edit.js), always
 * server-rendered into the actual repeated grid on the front end
 * (render.php). save() persists the real InnerBlocks, unlike every other
 * (fixed-children or leaf) block in this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
