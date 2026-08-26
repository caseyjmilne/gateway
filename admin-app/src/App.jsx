import DatabaseConfig from './screens/DatabaseConfig.jsx';

/**
 * Single-page shell for now -- the Gateway admin page currently has just
 * one screen (Database Connection). Structured as its own component tree
 * under src/screens/ so a nav and additional screens (e.g. managing Laravel
 * model definitions, once those exist) have an obvious place to grow into
 * later without reshaping this file.
 */
export default function App() {
	return (
		<div className="wrap gateway-admin-app">
			<h1>Gateway</h1>
			<DatabaseConfig />
		</div>
	);
}
