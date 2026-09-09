/**
 * Fetches the columns available for a post type (gateway/v1/columns/
 * <post_type>) or, when sourceType is 'collection', the fields available
 * for a Gateway model (gateway/v1/columns-for-collection/<class> --
 * Column_Registry::get_columns_for_collection(), itself backed by
 * Model_Fields::all()) -- same returned shape either way
 * ({key, label, type, isFilterable, facetType}), so every caller below
 * can treat "what's available to show/filter by" as one question
 * regardless of where the block's data actually comes from.
 *
 * Lives in blocks/shared/ (not the datatable block's own src/) since it's
 * used across block boundaries: the datatable block's edit.js (fetched
 * once, shared by ColumnsPanel and FacetsPanel -- "what fields exist for
 * this post type" is the same question for both), and the facet block's
 * edit.js, which needs the same field list purely to resolve a friendly
 * label for the facet it's configured for. Those other callers only ever
 * deal in post types -- passing a plain `postType` string (no second
 * argument) keeps them working unchanged; only gateway/datatable's own
 * edit.js currently ever passes `{ sourceType: 'collection', collection }`.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

/**
 * A plain `Map`, not React state -- shared by EVERY component instance
 * that ever calls this hook for the same `${isCollection}:${identifier}`,
 * for as long as this editor tab stays open (a fresh page load starts
 * empty; nothing here is persisted beyond that). Two distinct problems
 * this fixes, both really the same root cause -- this hook doing its own
 * independent fetch-on-mount with no memory of any other instance ever
 * having already asked the exact same question:
 *
 * 1. A Data Cards card commonly has SEVERAL gateway/card-field-text blocks
 *    showing different fields of the very same Collection -- every one of
 *    them, plus gateway/data-cards-body's own separate call for the same
 *    collection, was independently firing the identical
 *    `/gateway/v1/columns-for-collection/<class>` request.
 * 2. Reported directly: selecting ANY field block in the currently-active
 *    card (the one real, editable InnerBlocks region among gateway/
 *    data-cards-body's several rendered instances -- see that file's own
 *    docblock on why exactly one is real and the rest are inert
 *    `useBlockPreview` clones) briefly flashed every field in that SAME
 *    card back to "(no field selected)" before repopulating a moment
 *    later, "as if it had been refreshed" -- because that's exactly what
 *    was happening: selection remounted that card's real InnerBlocks
 *    subtree (a known rough edge of this "one real region among several
 *    inert clones" pattern, the same one core/post-template's own preview
 *    architecture is built on), and every gateway/card-field-text inside
 *    it started this hook over from scratch -- `isLoading: true`,
 *    `availableColumns: []` -- genuinely re-fetching before it could show
 *    the selected field's real value again. The remount itself is a
 *    Gutenberg-internals-level cost this fix doesn't try to prevent; what
 *    it removes is the NEEDLESS re-fetch (and the empty-state flash that
 *    came with it) a remount used to always cause.
 *
 * No TTL -- a stale entry only means a Collection's fields changed
 * elsewhere (the admin app, in another tab) without a full reload of this
 * editor tab, and this endpoint's own PHP-side response is ALREADY cached
 * for up to 15 minutes regardless (`Column_Registry::CACHE_TTL`), so a
 * client-side cache with no expiry at all is strictly no staler than what
 * this plugin already accepts server-side.
 *
 * Stashed on `window`, not just a plain module-level `Map` -- this file
 * lives in blocks/shared/ and is bundled SEPARATELY into every block that
 * imports it (not an externalized @wordpress/* package, unlike
 * `@wordpress/data`'s own true cross-bundle registry -- see blocks/shared/
 * store/data-cards-preview.js's own docblock for the identical reasoning),
 * so a plain module-level `Map` would only ever be shared between
 * instances of the SAME block type (every gateway/card-field-text on the
 * page, say), never across a mix of card-field-text/-number/-email/
 * -image/-markdown blocks showing the same Collection's columns -- each
 * gets its own separate copy of this whole module, `columnsCache` included.
 * One shared `window`-backed Map is what actually closes that gap for
 * every consumer, regardless of which block type happened to load first.
 */
if ( ! window.__gatewayAvailableColumnsCache ) {
	window.__gatewayAvailableColumnsCache = new Map();
}

const columnsCache = window.__gatewayAvailableColumnsCache;

/**
 * @param {string} postType Selected post type -- ignored when `options.sourceType` is 'collection'.
 * @param {Object} [options]
 * @param {string} [options.sourceType]  'postType' (default) or 'collection'.
 * @param {string} [options.collection]  Selected model class name, when sourceType is 'collection'.
 * @return {{availableColumns: Object[], isLoading: boolean, error: (string|null)}}
 */
export function useAvailableColumns( postType, options = {} ) {
	const { sourceType = 'postType', collection = '' } = options;
	const isCollection = 'collection' === sourceType;
	// Whichever of the two actually identifies what to fetch -- used as
	// the effect's own dependency below, so this only re-fetches when the
	// thing that matters for the *current* sourceType changes.
	const identifier = isCollection ? collection : postType;
	const key = `${ isCollection }:${ identifier }`;

	const [ availableColumns, setAvailableColumns ] = useState(
		() => columnsCache.get( key ) ?? []
	);
	const [ isLoading, setIsLoading ] = useState( () => ! columnsCache.has( key ) );
	const [ error, setError ] = useState( null );

	// Resets isLoading/availableColumns SYNCHRONOUSLY, during render, the
	// instant what's being fetched changes -- rather than waiting for the
	// effect below to run after commit. Without this, a consumer reading
	// isLoading/availableColumns on the very render `identifier` changes on
	// sees one stale render's worth of the PREVIOUS identifier's data
	// (often `isLoading: false` with an empty or mismatched
	// availableColumns) before the effect has even started the new fetch.
	// That's a real, observed bug: gateway/data-cards-body's own
	// swap-on-Source-change logic mistook that stale, momentary state for a
	// genuine "nothing to fetch" answer and gave up permanently. This is
	// the standard React "adjust state when a prop changes during render"
	// pattern -- calling setState here triggers an immediate re-render
	// before anything paints, not an extra visible commit. A cache hit for
	// the NEW key is applied here too, for the same reason it's applied on
	// mount above -- switching straight from one already-cached identifier
	// to another (e.g. a Collection picker change) deserves the same
	// instant, no-flash treatment as a remount does.
	const [ currentKey, setCurrentKey ] = useState( key );

	if ( key !== currentKey ) {
		setCurrentKey( key );
		setAvailableColumns( columnsCache.get( key ) ?? [] );
		setIsLoading( ! columnsCache.has( key ) );
		setError( null );
	}

	useEffect( () => {
		let isCurrent = true;

		if ( isCollection && ! collection ) {
			// No model chosen yet -- nothing to fetch, and no error either
			// (this is a normal, momentary state right after switching to
			// "Collection", before a model is picked).
			setAvailableColumns( [] );
			setIsLoading( false );
			setError( null );
			return;
		}

		const cached = columnsCache.get( key );

		if ( cached ) {
			// Already fetched (by this instance on a prior run, or by a
			// completely different consumer asking the same question) --
			// no need to hit the network again just to end up with the
			// exact same answer.
			setAvailableColumns( cached );
			setIsLoading( false );
			setError( null );
			return;
		}

		setIsLoading( true );
		setError( null );

		const path = isCollection
			? `/gateway/v1/columns-for-collection/${ collection }`
			: `/gateway/v1/columns/${ postType }`;

		apiFetch( { path } )
			.then( ( fetched ) => {
				columnsCache.set( key, fetched );

				if ( isCurrent ) {
					setAvailableColumns( fetched );
				}
			} )
			.catch( ( fetchError ) => {
				// Deliberately NOT cached -- a transient failure (the network,
				// a momentarily-unavailable REST route) shouldn't get "stuck"
				// for the rest of this editor session; the next mount/retry
				// should genuinely try again.
				if ( isCurrent ) {
					setError(
						fetchError?.message || __( 'Could not load columns.', 'gateway' )
					);
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoading( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ isCollection, identifier, key ] );

	return { availableColumns, isLoading, error };
}
