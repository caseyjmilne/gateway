/**
 * Editor registration for the gateway/card-facet block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * real filter control, and the interactive wiring only exists on the
 * front end (view.js), driving a REST refetch of the sibling Data Cards
 * grid. save() persists nothing besides the attributes/comment delimiter,
 * same as gateway/facet.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
