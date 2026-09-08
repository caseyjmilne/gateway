/**
 * Editor registration for the gateway/facet-has-value block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real checkbox, and the interactive wiring only exists on the front end
 * (view.js), driving a client-side DataTables `ext.search` filter, same
 * as gateway/facet. save() persists nothing besides the attributes/
 * comment delimiter.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
