/**
 * Editor registration for the gateway/card-facet-text block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real text input, and the interactive wiring only exists on the front
 * end (view.js), driving a REST refetch of the sibling Data Cards grid,
 * same as gateway/card-facet-has-value. save() persists nothing besides
 * the attributes/comment delimiter.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
