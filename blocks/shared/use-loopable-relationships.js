/**
 * Fetches a Collection's own "to many" relationships -- `hasMany`/
 * `belongsToMany` by default -- via the same `GET /gateway/v1/models/<class>/relationships`
 * route the admin app's own RelationshipEditor uses, filtered client-side
 * to just those types. Only a "to many" relationship is ever a
 * sensible thing to loop over: a `hasOne`/`belongsTo` has at most one
 * related record, which is exactly what a Related Field
 * (`Column_Registry::get_related_columns_for_collection()`) already
 * surfaces as a plain value, not a repeated list.
 *
 * `gateway/related-items` uses the default (either type -- a many-to-many
 * "loop" is just as coherent as a one-to-many one there). `gateway/data-display`
 * passes `['hasMany']` alone: its own parent/child sidebar hierarchy
 * (e.g. Doc Groups -> Docs) is specifically a one-to-many shape --
 * `belongsToMany` has no single "owning" side for a child to belong
 * under, so it's not offered there at all.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

const DEFAULT_LOOPABLE_TYPES = [ 'hasMany', 'belongsToMany' ];

/**
 * @param {string}   collection Model class name -- '' fetches nothing.
 * @param {string[]} [types]    Relationship types to keep. Defaults to
 *                               both "to many" types.
 * @return {{relationships: Object[], isLoading: boolean}}
 */
export function useLoopableRelationships( collection, types = DEFAULT_LOOPABLE_TYPES ) {
	const [ relationships, setRelationships ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );

	// Stringified so a caller passing a fresh `['hasMany']` array literal
	// on every render (the common case -- see gateway/data-display's own
	// edit.js) doesn't retrigger this effect every render the way a raw
	// array in the dependency list would.
	const typesKey = types.join( ',' );

	useEffect( () => {
		let isCurrent = true;

		if ( ! collection ) {
			setRelationships( [] );
			setIsLoading( false );
			return;
		}

		setIsLoading( true );

		apiFetch( { path: `/gateway/v1/models/${ collection }/relationships` } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					const allowed = typesKey.split( ',' );
					setRelationships(
						( fetched || [] ).filter( ( relationship ) =>
							allowed.includes( relationship.type )
						)
					);
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setRelationships( [] );
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
	}, [ collection, typesKey ] );

	return { relationships, isLoading };
}
