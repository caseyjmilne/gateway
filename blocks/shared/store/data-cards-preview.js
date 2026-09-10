/**
 * A tiny custom @wordpress/data store, purely so gateway/data-cards-body's
 * editor preview can hand its own computed pager metadata (page/pages/
 * totals) to gateway/data-cards-pagination and gateway/data-cards-results
 * -- SIBLING blocks, both children of the same parent gateway/data-cards
 * block, never descendants of -body itself (see data-cards/render.php's
 * own docblock).
 * WordPress block context (`providesContext`/`usesContext`) only ever
 * flows from ancestor to descendant, so it can't carry this sideways; a
 * plain, global custom store has no such restriction -- exactly the same
 * reasoning behind WordPress's own cross-cutting stores like `core/notices`.
 *
 * Deliberately NOT a `setAttributes()`/`updateBlockAttributes()` write onto
 * the real gateway/data-cards block's own attributes plus a matching
 * context key: that would dirty the post and pollute Undo/Redo on every
 * keystroke/filter change, and get needlessly serialized into post_content,
 * purely for ephemeral editor-preview UI state the front end never reads.
 *
 * Consumers correlate with each other via the shared ancestor
 * gateway/data-cards block's own clientId (`core/block-editor`'s
 * `getBlockParentsByBlockName()`), so multiple independent Data Cards
 * blocks on one page never collide.
 */

import { createReduxStore, register } from '@wordpress/data';

export const STORE_NAME = 'gateway/data-cards-preview';

const SET_PREVIEW_META = 'SET_PREVIEW_META';

// This module is bundled separately into EVERY block that imports it --
// blocks/shared/* isn't an externalized @wordpress/* package, so each of
// gateway/data-cards-body's, -pagination's, and -results' own build/
// index.js gets its own copy -- meaning this file's own top-level code
// runs once per consuming block's editorScript, all against the one real,
// global `wp.data` registry. This window-scoped guard avoids register()
// -ing the same store name more than once; harmless either way
// (@wordpress/data just logs a console error and keeps the first
// registration if this guard weren't here), but this keeps the console
// clean.
if ( ! window.__gatewayDataCardsPreviewStoreRegistered ) {
	register(
		createReduxStore( STORE_NAME, {
			reducer( state = {}, action ) {
				if ( SET_PREVIEW_META === action.type ) {
					return { ...state, [ action.key ]: action.meta };
				}

				return state;
			},

			actions: {
				/**
				 * @param {string} key  The publishing gateway/data-cards block's own clientId.
				 * @param {Object} meta `{ isLoading, page, pages, start, end, recordsDisplay, recordsTotal }`
				 *                      -- the same shape `Data_Cards_Renderer::build_pager_meta()`
				 *                      produces on the real front end, so
				 *                      `getPageWindow()`/`buildInfoText()`
				 *                      (blocks/shared/pagination-window.js,
				 *                      blocks/shared/results-text.js) work
				 *                      against it unchanged.
				 */
				setPreviewMeta( key, meta ) {
					return { type: SET_PREVIEW_META, key, meta };
				},
			},

			selectors: {
				getPreviewMeta( state, key ) {
					return state[ key ];
				},
			},
		} )
	);

	window.__gatewayDataCardsPreviewStoreRegistered = true;
}
