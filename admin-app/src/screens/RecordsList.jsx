import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api.js';
import { SkeletonTableRows } from '../components/Skeleton.jsx';

/**
 * Records home screen: every model, with its row count, linking to that
 * model's own CRUD screen. Reuses GET /gateway/v1/models -- the same
 * endpoint the Models screen's own list uses -- since Model_REST_Controller::
 * describe_model() already includes each model's count() alongside
 * everything else; no separate endpoint needed just for this list.
 *
 * No explanatory description under the heading -- removed per a direct
 * request ("remove notice 'Pick a model to add, edit, or delete its
 * records.'"); the table right below it (Model/Rows, each linking
 * straight to that model's own records) is self-explanatory without it.
 * `.gateway-records-list-heading`'s own `margin-bottom` (a further
 * direct request, "title 'Records' should be closer to table than
 * tabs") is the same value ModelDetail.jsx's/RecordsCrud.jsx's own
 * heading classes already use, for the identical reason: tightening the
 * gap to what the heading is actually titling (the table right beneath
 * it) rather than leaving it sitting equidistant between that and
 * WordPress's own primary Models/Records/Database tabs above.
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
			<h2 className="gateway-records-list-heading">Records</h2>

			{ error && (
				<div className="notice notice-error">
					<p>{ error }</p>
				</div>
			) }

			{ loading && (
				<span className="screen-reader-text" role="status">
					Loading models…
				</span>
			) }

			{ ! loading && models.length === 0 ? (
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
					{ loading ? (
						<SkeletonTableRows rowCount={ 3 } columnCount={ 2 } />
					) : (
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
					) }
				</table>
			) }
		</div>
	);
}
