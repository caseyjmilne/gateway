/**
 * Editor registration for the gateway/data-cards-search block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real, already-enabled input, and view.js only adds the debounced fetch
 * -on-input wiring on the front end. save() persists nothing besides the
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
