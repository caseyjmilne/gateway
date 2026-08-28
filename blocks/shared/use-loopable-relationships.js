/**
 * Fetches a Collection's own "to many" relationships -- `hasMany`/
 * `belongsToMany` -- via the same `GET /gateway/v1/models/<class>/relationships`
 * route the admin app's own RelationshipEditor uses, filtered client-side
 * to just those two types. Only a "to many" relationship is ever a
 * sensible thing to loop over: a `hasOne`/`belongsTo` has at most one
 * related record, which is exactly what a Related Field
 * (`Column_Registry::get_related_columns_for_collection()`) already
 * surfaces as a plain value, not a repeated list -- see
 * `gateway/related-items`, the one block that uses this.
 */

import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

const LOOPABLE_TYPES = [ 'hasMany', 'belongsToMany' ];

/**
 * @param {string} collection Model class name -- '' fetches nothing.
 * @return {{relationships: Object[], isLoading: boolean}}
 */
export function useLoopableRelationships( collection ) {
	const [ relationships, setRelationships ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );

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
					setRelationships(
						( fetched || [] ).filter( ( relationship ) =>
							LOOPABLE_TYPES.includes( relationship.type )
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
	}, [ collection ] );

	return { relationships, isLoading };
}
