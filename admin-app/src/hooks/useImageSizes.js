import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

/**
 * Fetches this site's own registered image sizes (`wp_get_registered_image_subsizes()`
 * plus a synthetic "Full Size" entry, via GET /gateway/v1/image-sizes)
 * once on mount -- what `FieldEditor.jsx`'s own Presentation tab builds
 * an Image field's "Preview Size" `<select>` from, instead of a
 * hardcoded guess at what sizes this particular site actually has.
 *
 * Same "start empty, fail silently" trade-off as useFieldTypes()/
 * useRelationshipTypes() -- this is metadata a screen enhances itself
 * with, not something its own primary task depends on.
 */
export default function useImageSizes() {
	const [ imageSizes, setImageSizes ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		apiFetch( '/image-sizes' )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setImageSizes( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return imageSizes;
}
