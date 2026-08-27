/**
 * Editor registration for the gateway/card-field-text block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php prints the
 * field's value on the front end (via the 'record' block context injected
 * by Data_Cards_Renderer::render_items_for_collection()); save() persists
 * nothing besides the attributes/comment delimiter, same as
 * gateway/card-facet.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
