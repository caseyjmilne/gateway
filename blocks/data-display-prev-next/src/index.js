/**
 * Editor registration for the gateway/data-display-prev-next block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php prints
 * inert placeholder markup (see that file's own docblock for why it
 * can't compute the real links itself), and view.js does the actual
 * work on the front end. save() persists nothing besides the
 * attributes/comment delimiter, same as every other leaf block in this
 * plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
