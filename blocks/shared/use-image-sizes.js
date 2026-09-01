/**
 * Fetches this site's own registered image sizes (`GET /gateway/v1/image-sizes`
 * -- `wp_get_registered_image_subsizes()` plus a synthetic "Full Size"
 * entry) once on mount -- the block-editor-side counterpart to the admin
 * app's own `useImageSizes.js` hook (`FieldEditor.jsx`'s Preview Size
 * `<select>`), rewritten against `@wordpress/api-fetch` instead of that
 * app's own `apiFetch()` wrapper since blocks and the admin app are two
 * separate builds (see this plugin's own README on why). What
 * `gateway/card-field-image`'s own Size `<select>` is built from, instead
 * of a hardcoded guess at what sizes this particular site actually has.
 *
 * Same "start empty, fail silently" trade-off as `use-available-columns.js`
 * -- this is metadata a block enhances its own Inspector with, not
 * something its front-end rendering (a plain, real WP core
 * `wp_get_attachment_image()` call server-side, in render.php) depends
 * on at all.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

/**
 * @return {{imageSizes: Object[], isLoading: boolean}} `imageSizes` is `[{key, label}, ...]`, 'full' always first.
 */
export function useImageSizes() {
	const [ imageSizes, setImageSizes ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );

	useEffect( () => {
		let isCurrent = true;

		apiFetch( { path: '/gateway/v1/image-sizes' } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					setImageSizes( fetched );
				}
			} )
			.catch( () => {} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoading( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [] );

	return { imageSizes, isLoading };
}
