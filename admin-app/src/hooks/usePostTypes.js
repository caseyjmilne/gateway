import { useEffect, useState } from 'react';
import { fetchPostTypes } from '../api.js';

/**
 * Fetches this site's own registered post types (`fetchPostTypes()`, a
 * direct `wp/v2/types` call -- see that function's own docblock) once on
 * mount -- what `FieldEditor.jsx`'s own "Filter by Post Type" setting
 * (`Post_Object_Field_Type`) builds its option list from.
 *
 * Same "start empty, fail silently" trade-off as `useImageSizes()`/
 * `useFieldTypes()` -- this is metadata a settings widget enhances
 * itself with, not something a screen's own primary task depends on.
 */
export default function usePostTypes() {
	const [ postTypes, setPostTypes ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		fetchPostTypes()
			.then( ( data ) => {
				if ( ! cancelled ) {
					setPostTypes( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return postTypes;
}
