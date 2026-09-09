/**
 * Editor registration for the gateway/data-cards block.
 *
 * The grid itself is always server-rendered (render.php) -- but the block
 * accepts gateway/data-cards-body/-footer children (its own required
 * zones -- see edit.js's own REQUIRED_BLOCKS) alongside whatever else a
 * site owner's own template holds (a Header/Facets Row, gateway/card-facet
 * controls, ...), and InnerBlocks content has to actually be saved into
 * post_content for render.php to receive it (via $block->inner_blocks),
 * so save() persists that.
 */

import { registerBlockType, registerBlockVariation } from '@wordpress/blocks';

import metadata from '../block.json';
import Edit from './edit';
import save from './save';

registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );

// Changing block.json's own `sourceType` default would silently change the
// effective, rendered behavior of every already-published block that never
// explicitly set it (Gutenberg omits an attribute from the saved comment
// when it matches the CURRENTLY REGISTERED default, and fills an omitted
// attribute back in from that same current default at parse/render time --
// not the default in effect when it was originally saved). An `isDefault`
// variation is the safe alternative WordPress core itself uses for exactly
// this: it only changes what a FRESHLY INSERTED block starts with, leaving
// the schema used to parse existing content untouched. No title/icon/
// description override -- a variation without one falls back to the block
// type's own, so this stays a single "Data Cards" inserter entry, just
// seeded with `sourceType: 'collection'` instead of `'postType'`.
registerBlockVariation( metadata.name, {
	name: 'default-model',
	isDefault: true,
	attributes: { sourceType: 'collection' },
} );
