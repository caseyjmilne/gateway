/**
 * Editor registration for the gateway/data-cards-results block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real, already-correct summary text, and view.js only keeps it in sync
 * with later fetches on the front end. save() persists nothing besides
 * the attributes/comment delimiter, same as every other leaf block in
 * this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
