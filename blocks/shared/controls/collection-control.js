/**
 * Collection (Gateway model) select control -- the "which model" picker
 * shown once a block's Source is set to "Collection", the direct
 * counterpart to PostTypeControl's own "which post type" picker.
 *
 * Fetches GET /gateway/v1/models (Model_REST_Controller::list_models(),
 * the same endpoint the admin app's own Models/Records screens use) --
 * not a dedicated block-editor-only route, since "every registered
 * model, with its stored Plural Title" is already exactly what this
 * needs, with nothing post-type-specific (like PostTypeControl's own
 * `viewable`/EXCLUDED_POST_TYPES filtering) to add on top.
 */

import { useEffect, useState } from '@wordpress/element';
import { SelectControl, Spinner } from '@wordpress/components';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';

export default function CollectionControl( { value, onChange } ) {
	const [ models, setModels ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );
	const [ error, setError ] = useState( null );

	useEffect( () => {
		let isCurrent = true;

		apiFetch( { path: '/gateway/v1/models' } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					setModels( fetched );
				}
			} )
			.catch( ( fetchError ) => {
				if ( isCurrent ) {
					setError(
						fetchError?.message ||
							__( 'Could not load Collections.', 'gateway' )
					);
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
	}, [] );

	if ( isLoading ) {
		return <Spinner />;
	}

	if ( error ) {
		return <p className="description">{ error }</p>;
	}

	if ( ! models.length ) {
		return (
			<p className="description">
				{ __(
					'No Collections yet -- create a model under Gateway > Models first.',
					'gateway'
				) }
			</p>
		);
	}

	const options = models.map( ( model ) => ( {
		label: model.plural_title || model.class,
		value: model.class,
	} ) );

	return (
		<SelectControl
			label={ __( 'Collection', 'gateway' ) }
			value={ value }
			options={ options }
			onChange={ onChange }
		/>
	);
}
