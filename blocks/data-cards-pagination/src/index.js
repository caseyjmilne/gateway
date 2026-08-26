/**
 * Editor registration for the gateway/data-cards-pagination block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real, already-correct Previous/Next/page-number buttons, and view.js
 * only adds the click-to-fetch wiring on the front end. save() persists
 * nothing besides the attributes/comment delimiter, same as every other
 * leaf block in this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
