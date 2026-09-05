/**
 * Editor registration for the gateway/data-display-toc block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php prints
 * inert placeholder markup (see that file's own docblock for why it
 * can't build the real list itself), and view.js does the actual work
 * on the front end. save() persists nothing besides the attributes/
 * comment delimiter, same as every other leaf block in this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
