/**
 * Fetches the columns available for a post type from the
 * gateway/v1/columns/<post_type> REST route.
 *
 * Shared by ColumnsPanel and FacetsPanel: "what fields exist for this post
 * type" is the exact same question for both -- a column is something to
 * display, a facet is something to filter by, but they draw from the same
 * field list, so this fetch happens once (in edit.js) and both panels
 * consume the same result rather than each fetching it independently.
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
