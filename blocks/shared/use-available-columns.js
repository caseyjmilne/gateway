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

	const [ availableColumns, setAvailableColumns ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );

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

		setIsLoading( true );
		setError( null );

		const path = isCollection
			? `/gateway/v1/columns-for-collection/${ collection }`
			: `/gateway/v1/columns/${ postType }`;

		apiFetch( { path } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					setAvailableColumns( fetched );
				}
			} )
			.catch( ( fetchError ) => {
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
	}, [ isCollection, identifier ] );

	return { availableColumns, isLoading, error };
}
