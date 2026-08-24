/**
 * Editor registration for the gateway/facet block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * actual control markup from context + attributes, so save() persists
 * nothing besides the attributes/comment delimiter, same as the datatable
 * block did before it grew InnerBlocks support.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
