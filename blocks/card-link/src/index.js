/**
 * Editor registration for the gateway/card-link block.
 *
 * A dynamic block -- render.php builds the actual `<a>` (or no wrapper
 * at all, when there's no permalink to link to) on every request, so
 * save() only needs to persist the real InnerBlocks for storage -- see
 * that file's own docblock for why, unlike most other dynamic wrappers
 * in this plugin, it emits no markup of its own at all. `deprecated`
 * keeps an already-published post's own OLD, `<div>`-wrapped save()
 * output recognized as valid rather than flagged as invalid content --
 * see deprecated.js.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';
import deprecated from './deprecated';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
	deprecated,
} );
