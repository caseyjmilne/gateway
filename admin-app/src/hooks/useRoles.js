import { useEffect, useState } from 'react';
import { fetchRoles } from '../api.js';

/**
 * Fetches this site's own registered WP roles (`fetchRoles()`, via
 * `GET /gateway/v1/roles`) once on mount -- what `FieldEditor.jsx`'s own
 * "Filter by Role" setting (`User_Field_Type`) builds its option list
 * from.
 *
 * Same "start empty, fail silently" trade-off as `usePostTypes()`/
 * `useImageSizes()` -- this is metadata a settings widget enhances
 * itself with, not something a screen's own primary task depends on.
 */
export default function useRoles() {
	const [ roles, setRoles ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		fetchRoles()
			.then( ( data ) => {
				if ( ! cancelled ) {
					setRoles( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return roles;
}
