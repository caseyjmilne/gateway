/**
 * Editor registration for the gateway/single-record block.
 *
 * A dynamic block -- render.php builds the actual output on every
 * request (validating `collection` against the real resolved
 * `gateway_model` query var, then passing InnerBlocks content straight
 * through -- see that file's own docblock), so save() only needs to
 * persist the real InnerBlocks for storage/parsing, same reasoning as
 * every other dynamic InnerBlocks block in this plugin.
 */

import { registerBlockType } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
