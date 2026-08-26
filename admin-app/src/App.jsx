import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import DatabaseConfig from './screens/DatabaseConfig.jsx';
import ModelsList from './screens/ModelsList.jsx';
import ModelDetail from './screens/ModelDetail.jsx';

/**
 * HashRouter, not BrowserRouter: this app is loaded from one fixed
 * wp-admin URL (admin.php?page=gateway) that WordPress's own PHP routing
 * owns -- there's no server-side route for, say,
 * admin.php?page=gateway/models/Widget for an actual browser
 * navigation/refresh/bookmark to hit, and no WordPress rewrite rule this
 * plugin could add would change that. Routing via the URL's #hash
 * fragment instead keeps every route (the models list, a single model)
 * bookmarkable and back-button-friendly without needing any of that.
 */
export default function App() {
	return (
		<HashRouter>
			<div className="wrap gateway-admin-app">
				<h1>Gateway</h1>
				<nav className="nav-tab-wrapper">
					<NavLink to="/" end className={ navTabClass }>
						Models
					</NavLink>
					<NavLink to="/database" className={ navTabClass }>
						Database
					</NavLink>
				</nav>
				<Routes>
					<Route path="/" element={ <ModelsList /> } />
					<Route path="/models/:className" element={ <ModelDetail /> } />
					<Route path="/database" element={ <DatabaseConfig /> } />
				</Routes>
			</div>
		</HashRouter>
	);
}

function navTabClass( { isActive } ) {
	return `nav-tab${ isActive ? ' nav-tab-active' : '' }`;
}
