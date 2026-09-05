import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

/**
 * Resolves a model's own URL slug (`Model_Builder::slug_for_class()`'s
 * output, e.g. "doc" -- see that method's own docblock) back to its real
 * class name (e.g. "Doc") -- what `ModelDetail.jsx`/`RecordsCrud.jsx`
 * both need before they can call any of the REST routes that actually
 * take a class name (every one of them still does; only the ROUTER's own
 * URL uses the slug instead -- "more correct for a URL" than the raw
 * class name, per a direct request: `#/models/doc`, not `#/models/Doc`).
 *
 * Fetches the full models list (`GET /models` -- the same route
 * `ModelsList.jsx`'s own table already uses) rather than adding a
 * dedicated "resolve this one slug" REST route of its own: every
 * registered model's own class name is already right there in that one
 * response, and a slug is never stored anywhere to begin with (always
 * mechanically re-derived server-side -- see `Model_REST_Controller::
 * describe_model()`), so there's nothing a narrower route could look up
 * that this can't already.
 *
 * @param {string} slug The URL's own `:modelSlug` route param.
 * @return {{className: (string|null), error: string}} `className` stays
 *         `null` while resolving, or whenever `error` is set (a slug
 *         matching no currently-registered model, or the list request
 *         itself failing).
 */
export default function useResolvedModelClass( slug ) {
	const [ className, setClassName ] = useState( null );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		let cancelled = false;

		setClassName( null );
		setError( '' );

		apiFetch( '/models' )
			.then( ( models ) => {
				if ( cancelled ) {
					return;
				}

				const match = ( models || [] ).find( ( model ) => model.slug === slug );

				if ( match ) {
					setClassName( match.class );
				} else {
					setError( 'Model not found.' );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setError( err.message );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [ slug ] );

	return { className, error };
}
