/**
 * Editor registration for the gateway/datatable-search block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds a
 * disabled skeleton, and the real, wired-up input only exists on the
 * front end (view.js), hooked into the sibling table's DataTable
 * instance. save() persists nothing besides the attributes/comment
 * delimiter, same as the facet and pagination blocks.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
