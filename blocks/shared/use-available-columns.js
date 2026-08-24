/**
 * Fetches the columns available for a post type from the
 * gateway/v1/columns/<post_type> REST route.
 *
 * Lives in blocks/shared/ (not the datatable block's own src/) since it's
 * used across block boundaries: the datatable block's edit.js (fetched
 * once, shared by ColumnsPanel and FacetsPanel -- "what fields exist for
 * this post type" is the same question for both), and the facet block's
 * edit.js, which needs the same field list purely to resolve a friendly
 * label for the facet it's configured for.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

/**
 * @param {string} postType Selected post type.
 * @return {{availableColumns: Object[], isLoading: boolean, error: (string|null)}}
 */
export function useAvailableColumns( postType ) {
	const [ availableColumns, setAvailableColumns ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );

	useEffect( () => {
		let isCurrent = true;

		setIsLoading( true );
		setError( null );

		apiFetch( { path: `/gateway/v1/columns/${ postType }` } )
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
	}, [ postType ] );

	return { availableColumns, isLoading, error };
}
