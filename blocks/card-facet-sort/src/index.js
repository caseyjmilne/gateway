/**
 * Editor registration for the gateway/card-facet-sort block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real, already-populated `<select>`, and view.js only adds the
 * change-triggered refetch wiring on the front end. save() persists
 * nothing besides the attributes/comment delimiter, same as every other
 * leaf block in this plugin (e.g. gateway/card-facet-search).
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
