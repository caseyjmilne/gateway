/**
 * Editor registration for the gateway/pagination block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds an
 * empty skeleton, and the real interactive Prev/Next/page-number control
 * only exists on the front end (view.js), hooked into the sibling table's
 * DataTable instance. save() persists nothing besides the attributes/
 * comment delimiter, same as the facet block.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';

registerBlockType( metadata.name, {
	edit: Edit,
	save: () => null,
} );
