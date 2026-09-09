/**
 * Editor registration for the gateway/facet-text block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real text input, and the interactive wiring only exists on the front
 * end (view.js), driving a client-side DataTables "Contains" search, same
 * as gateway/facet's own "input" UI type. save() persists nothing besides
 * the attributes/comment delimiter.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
