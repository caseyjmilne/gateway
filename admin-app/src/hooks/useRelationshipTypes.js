import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

/**
 * Fetches the available relationship types (Gateway\Model_Relationships::
 * describe_types(), via GET /gateway/v1/relationship-types) once on
 * mount -- what RelationshipEditor's own type dropdown is built from,
 * instead of a hardcoded copy of "hasOne"/"hasMany"/etc. in JavaScript.
 *
 * Same "start empty, fail silently" trade-off as useFieldTypes() -- this
 * is metadata a screen enhances itself with, not something its own
 * primary task depends on.
 */
export default function useRelationshipTypes() {
	const [ relationshipTypes, setRelationshipTypes ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		apiFetch( '/relationship-types' )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setRelationshipTypes( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return relationshipTypes;
}
