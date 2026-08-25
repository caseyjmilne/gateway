/**
 * Self-heals gateway/datatable's required, named children (Facets, Header,
 * Body, Footer) -- inserting any that are missing, at the correct
 * position, WITHOUT touching any that already exist (their own attributes
 * and nested inner blocks included).
 *
 * Why this exists instead of relying on `template` + `templateLock: 'all'`
 * (an earlier version of this used exactly that): that lock's own built-in
 * synchronization (`synchronizeBlocksWithTemplate`, in @wordpress/blocks)
 * matches existing blocks to the template BY POSITION, not by name. A
 * block instance saved *before* a new required child was introduced (e.g.
 * gateway/datatable-body, added after gateway/datatable-header/-footer
 * already existed) has only 2 existing children where the template now
 * has 3+ -- so the sync compared index-for-index, found the existing
 * Footer sitting at the position the template now expects Body to be,
 * and *discarded that Footer entirely*, replacing it with a fresh default
 * one. In practice: reopening a datatable block saved under the older,
 * 2-child structure silently threw away a site owner's own Pagination/
 * Results configuration in the Footer, replacing it with the template's
 * defaults, the moment the post was next saved.
 *
 * Name-based, one-at-a-time insertion here can't make that mistake: it
 * only ever ADDS a block whose name is genuinely absent, at a position
 * computed from the *names* of blocks that already exist (never assumes
 * anything about index alignment), and never removes or replaces anything.
 */

import { useEffect } from '@wordpress/element';
import { useSelect, useDispatch } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';

/**
 * @param {string}   clientId This block's client ID.
 * @param {string[]} required Ordered list of required child block names.
 * @param {Function} buildBlock ( name ) => Block, building a fresh default instance of one required block.
 */
export function useRequiredInnerBlocks( clientId, required, buildBlock ) {
	const innerBlocks = useSelect(
		( select ) => select( blockEditorStore ).getBlocks( clientId ),
		[ clientId ]
	);
	const { insertBlock } = useDispatch( blockEditorStore );

	useEffect( () => {
		const names = innerBlocks.map( ( block ) => block.name );
		const missingIndex = required.findIndex(
			( name ) => ! names.includes( name )
		);

		if ( -1 === missingIndex ) {
			return;
		}

		// Insert right after the nearest earlier required block that
		// already exists, or at the very start if none do. Only one
		// insertion per effect run -- `innerBlocks` changing as a result
		// is what re-triggers this to handle any further missing blocks,
		// each time recomputed against the now-current, real list rather
		// than an assumption about how many insertions are still pending.
		let insertAt = 0;

		for ( let i = missingIndex - 1; i >= 0; i-- ) {
			const existingIndex = names.indexOf( required[ i ] );

			if ( existingIndex !== -1 ) {
				insertAt = existingIndex + 1;
				break;
			}
		}

		insertBlock(
			buildBlock( required[ missingIndex ] ),
			insertAt,
			clientId,
			false
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ innerBlocks ] );
}
