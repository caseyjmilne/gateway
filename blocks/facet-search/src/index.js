/**
 * Editor registration for the gateway/facet-search block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real (disabled-until-ready) input, and view.js drives it once a
 * DataTable instance exists. save() persists nothing besides the
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
