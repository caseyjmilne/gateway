import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '../api.js';

/**
 * Single-model detail view -- what's known about one registered model:
 * its table, and its migration's version + whether it has actually run
 * (see Model_REST_Controller::describe_model() on the PHP side).
 */
export default function ModelDetail() {
	const { className } = useParams();
	const [ model, setModel ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		let cancelled = false;

		setLoading( true );
		setError( '' );
		setModel( null );

		apiFetch( `/models/${ encodeURIComponent( className ) }` )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setModel( data );
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
	}, [ className ] );

	return (
		<div className="gateway-model-detail">
			<p>
				<Link to="/">&larr; Back to Models</Link>
			</p>

			{ loading && <p>Loading…</p> }

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ model && (
				<>
					<h2>
						<code>{ model.class }</code>
					</h2>
					<table className="form-table" role="presentation">
						<tbody>
							<tr>
								<th scope="row">Table</th>
								<td>
									<code>{ model.table }</code>
								</td>
							</tr>
							{ model.migration && (
								<>
									<tr>
										<th scope="row">Migration</th>
										<td>
											<code>
												{ model.migration.class }
											</code>{ ' ' }
											(version{ ' ' }
											{ model.migration.version })
										</td>
									</tr>
									<tr>
										<th scope="row">Status</th>
										<td>
											{ model.migration.has_run
												? '✅ Table created'
												: '⚠️ Migration not yet run' }
										</td>
									</tr>
								</>
							) }
						</tbody>
					</table>
				</>
			) }
		</div>
	);
}
