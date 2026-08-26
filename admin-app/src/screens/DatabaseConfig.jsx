import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const EMPTY_CONFIG = {
	host: '',
	port: '',
	unix_socket: '',
	database: '',
	username: '',
	prefix: '',
};

/**
 * Lets a site administrator confirm Gateway's own PDO connection -- kept
 * separate from $wpdb, for Laravel-style Eloquent models to use -- can
 * actually reach the database, and override the port when it differs from
 * the default 3306 (common when the database runs in a container that maps
 * MySQL to a different host port). Every test times out after 3 seconds
 * (see Database_Connection::CONNECT_TIMEOUT) rather than PHP's own much
 * longer socket default, so a wrong port fails fast instead of stalling
 * the page.
 */
export default function DatabaseConfig() {
	const [ config, setConfig ] = useState( EMPTY_CONFIG );
	const [ port, setPort ] = useState( '' );
	const [ loadingConfig, setLoadingConfig ] = useState( true );
	const [ loadError, setLoadError ] = useState( '' );
	const [ testing, setTesting ] = useState( false );
	const [ result, setResult ] = useState( null );

	const loadConfig = useCallback( async () => {
		setLoadingConfig( true );
		setLoadError( '' );

		try {
			const data = await apiFetch( '/database/config' );
			setConfig( data );
			setPort( data.port || '' );
		} catch ( error ) {
			setLoadError( error.message );
		} finally {
			setLoadingConfig( false );
		}
	}, [] );

	useEffect( () => {
		loadConfig();
	}, [ loadConfig ] );

	const handleTest = async ( event ) => {
		event.preventDefault();
		setTesting( true );
		setResult( null );

		try {
			const data = await apiFetch( '/database/test', {
				method: 'POST',
				body: JSON.stringify( { port } ),
			} );
			setResult( data );
			setConfig( data.config );
			setPort( data.config.port || '' );
		} catch ( error ) {
			setResult( { success: false, message: error.message, latency_ms: null } );
		} finally {
			setTesting( false );
		}
	};

	return (
		<div className="gateway-database-config">
			<h2>Database Connection</h2>
			<p className="description">
				Gateway opens its own PDO connection to this same database --
				separate from $wpdb -- for Laravel-style Eloquent models to
				use. Use this screen to confirm it can connect, and to set a
				custom port if the database isn&rsquo;t reachable on the
				default 3306 (common when it runs in a container that maps
				MySQL to a different host port). Connection attempts time out
				after 3 seconds.
			</p>

			{ loadError && (
				<div className="notice notice-error">
					<p>{ loadError }</p>
				</div>
			) }

			<form onSubmit={ handleTest }>
				<table className="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-db-host">Host</label>
							</th>
							<td>
								<input
									id="gateway-db-host"
									type="text"
									className="regular-text"
									value={
										loadingConfig
											? 'Loading…'
											: config.unix_socket
											? config.unix_socket
											: config.host
									}
									readOnly
								/>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-db-port">Port</label>
							</th>
							<td>
								<input
									id="gateway-db-port"
									type="text"
									inputMode="numeric"
									className="regular-text"
									value={ port }
									onChange={ ( event ) => setPort( event.target.value ) }
									placeholder="3306"
									disabled={ loadingConfig }
								/>
								<p className="description">
									Leave blank to use the default MySQL port
									(3306). Ignored while connecting over a
									unix socket.
								</p>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-db-database">
									Database
								</label>
							</th>
							<td>
								<input
									id="gateway-db-database"
									type="text"
									className="regular-text"
									value={ loadingConfig ? '' : config.database }
									readOnly
								/>
							</td>
						</tr>
						<tr>
							<th scope="row">
								<label htmlFor="gateway-db-username">
									Username
								</label>
							</th>
							<td>
								<input
									id="gateway-db-username"
									type="text"
									className="regular-text"
									value={ loadingConfig ? '' : config.username }
									readOnly
								/>
							</td>
						</tr>
					</tbody>
				</table>

				<p>
					<button
						type="submit"
						className="button button-primary"
						disabled={ testing || loadingConfig }
					>
						{ testing ? 'Testing…' : 'Test Connection' }
					</button>
				</p>
			</form>

			{ result && (
				<div
					className={ `notice ${
						result.success ? 'notice-success' : 'notice-error'
					}` }
				>
					<p>
						{ result.message }
						{ null !== result.latency_ms &&
							` (${ result.latency_ms }ms)` }
					</p>
				</div>
			) }
		</div>
	);
}
