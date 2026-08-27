import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

/**
 * Fetches the registered field types (Gateway\Field_Type_Registry, via
 * GET /gateway/v1/field-types) once on mount -- the single source of
 * truth both FieldEditor and the Records CRUD form build their type
 * dropdown/<input> rendering from, instead of each keeping its own
 * hardcoded copy of "text"/"number".
 *
 * Starts empty and fails silently (falls back to whatever the browser
 * does with an empty <select>/a plain text input) rather than surfacing
 * a loading error of its own -- this is metadata a screen enhances itself
 * with, not something its own primary task depends on.
 */
export default function useFieldTypes() {
	const [ fieldTypes, setFieldTypes ] = useState( [] );

	useEffect( () => {
		let cancelled = false;

		apiFetch( '/field-types' )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setFieldTypes( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return fieldTypes;
}
