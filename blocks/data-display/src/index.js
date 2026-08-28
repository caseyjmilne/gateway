/**
 * Editor registration for the gateway/data-display block.
 *
 * Structurally the same as gateway/data-cards-body/gateway/related-items:
 * a real, editable InnerBlocks template (edited against one specific
 * child record at a time -- see edit.js), always server-rendered into
 * the actual sidebar/main-pane markup on the front end (render.php).
 * save() persists the real InnerBlocks, same reasoning as those blocks'
 * own index.js.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
