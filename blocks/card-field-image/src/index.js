/**
 * Editor registration for the gateway/card-field-image block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php prints the
 * real, resolved <img> on the front end (via the 'record' block context
 * injected by Data_Cards_Renderer::render_items_for_collection()); save()
 * persists nothing besides the attributes/comment delimiter, same as
 * gateway/card-field-text/gateway/card-field-number.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
