import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';

/**
 * Records home screen: every model, with its row count, linking to that
 * model's own CRUD screen. Reuses GET /gateway/v1/models -- the same
 * endpoint the Models screen's own list uses -- since Model_REST_Controller::
 * describe_model() already includes each model's count() alongside
 * everything else; no separate endpoint needed just for this list.
 */
export default function RecordsList() {
	const [ models, setModels ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		let cancelled = false;

		apiFetch( '/models' )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setModels( data );
				}
			} )
			.catch( ( err ) => {
				if ( ! cancelled ) {
					setError( err.message );
				}
			} )
			.finally( () => {
				if ( ! cancelled ) {
					setLoading( false );
				}
			} );

		return () => {
			cancelled = true;
		};
	}, [] );

	return (
		<div className="gateway-records-list">
			<h2>Records</h2>
			<p className="description">
				Pick a model to add, edit, or delete its records.
			</p>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ loading ? (
				<p>Loading…</p>
			) : models.length === 0 ? (
				<p className="description">
					No models yet -- create one under{ ' ' }
					<Link to="/">Models</Link> first.
				</p>
			) : (
				<table className="widefat striped">
					<thead>
						<tr>
							<th>Model</th>
							<th>Rows</th>
						</tr>
					</thead>
					<tbody>
						{ models.map( ( model ) => (
							<tr key={ model.class }>
								<td>
									<Link to={ `/records/${ model.slug }` }>
										<code>{ model.class }</code>
									</Link>
								</td>
								<td>
									{ null === model.count ? '—' : model.count }
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }
		</div>
	);
}
