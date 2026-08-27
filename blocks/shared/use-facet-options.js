/**
 * Fetches the real Select/Checkboxes options for one facet -- the
 * editor-preview counterpart to what Facet_Query::get_facet_options()/
 * get_facet_options_for_collection() already hand render.php for the
 * front end (Facet_Options_REST_Controller). Without this, a facet
 * block's own editor preview had no way to show anything but a single
 * static placeholder ("All" for Select, "Example value" for Checkboxes)
 * regardless of UI type -- this makes both show the SAME real list a
 * visitor would actually see.
 *
 * Skips the fetch entirely unless it's actually needed: no facet chosen
 * yet, a UI type ("input") that has no options concept at all, or --
 * for a Collection -- no Collection chosen yet.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

/**
 * @param {Object} args
 * @param {string} [args.sourceType] 'postType' (default) or 'collection'.
 * @param {string} [args.postType]   Post type slug -- ignored when sourceType is 'collection'.
 * @param {string} [args.collection] Model class name, when sourceType is 'collection'.
 * @param {string} args.facetKey     The field/column key options are being discovered for.
 * @param {string} args.uiType       'input' | 'select' | 'checkboxes' -- only the latter two need options.
 * @return {{options: Object[], isLoading: boolean}} `options`: `[{ value, label }]`.
 */
export function useFacetOptions( { sourceType = 'postType', postType, collection, facetKey, uiType } ) {
	const isCollection = 'collection' === sourceType;
	const needsOptions =
		Boolean( facetKey ) &&
		( 'select' === uiType || 'checkboxes' === uiType ) &&
		( ! isCollection || Boolean( collection ) );

	const [ options, setOptions ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( false );

	useEffect( () => {
		if ( ! needsOptions ) {
			setOptions( [] );
			setIsLoading( false );
			return;
		}

		let isCurrent = true;
		setIsLoading( true );

		const path = isCollection
			? `/gateway/v1/facet-options-for-collection/${ collection }?key=${ encodeURIComponent( facetKey ) }`
			: `/gateway/v1/facet-options/${ postType }?key=${ encodeURIComponent( facetKey ) }`;

		apiFetch( { path } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					setOptions( Array.isArray( fetched ) ? fetched : [] );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setOptions( [] );
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
	}, [ needsOptions, isCollection, postType, collection, facetKey ] );

	return { options, isLoading };
}
