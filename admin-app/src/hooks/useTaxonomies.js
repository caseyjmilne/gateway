import { useEffect, useState } from 'react';
import { fetchTaxonomies } from '../api.js';

/**
 * Fetches this site's own registered taxonomies (`fetchTaxonomies()`, a
 * direct `wp/v2/taxonomies` call -- see that function's own docblock)
 * once on mount -- what `FieldEditor.jsx`'s own "Filter by Taxonomy"
 * setting (`Post_Object_Field_Type`) builds its option list from.
 *
 * Same "start empty, fail silently" trade-off as `usePostTypes()`/
 * `useImageSizes()` above.
 */
export default function useTaxonomies() {
	const [ taxonomies, setTaxonomies ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		fetchTaxonomies()
			.then( ( data ) => {
				if ( ! cancelled ) {
					setTaxonomies( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return taxonomies;
}
