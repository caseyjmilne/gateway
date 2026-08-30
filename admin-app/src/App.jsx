import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import DatabaseConfig from './screens/DatabaseConfig.jsx';
import ModelsList from './screens/ModelsList.jsx';
import ModelDetail from './screens/ModelDetail.jsx';
import RecordsList from './screens/RecordsList.jsx';
import RecordsCrud from './screens/RecordsCrud.jsx';

/**
 * HashRouter, not BrowserRouter: this app is loaded from one fixed
 * wp-admin URL (admin.php?page=gateway) that WordPress's own PHP routing
 * owns -- there's no server-side route for, say,
 * admin.php?page=gateway/models/Widget for an actual browser
 * navigation/refresh/bookmark to hit, and no WordPress rewrite rule this
 * plugin could add would change that. Routing via the URL's #hash
 * fragment instead keeps every route (the models list, a single model,
 * a model's records) bookmarkable and back-button-friendly without
 * needing any of that.
 */
export default function App() {
	return (
		<HashRouter>
			<div className="wrap gateway-admin-app">
				<h1>Gateway</h1>
				<MainTabs />
				<Routes>
					<Route path="/" element={ <ModelsList /> } />
					<Route path="/models/:className" element={ <ModelDetail /> } />
					<Route path="/records" element={ <RecordsList /> } />
					<Route path="/records/:className" element={ <RecordsCrud /> } />
					<Route path="/database" element={ <DatabaseConfig /> } />
				</Routes>
			</div>
		</HashRouter>
	);
}

/**
 * The app's own top-level Models/Records/Database tab strip -- plain
 * `Link`s, not `NavLink`, with each one's own "active" state computed by
 * hand from the current pathname rather than left to `NavLink`'s own
 * built-in matching. `NavLink` alone can't express what the Models tab
 * actually needs: `to="/"` has to pass `end` (or it would match every
 * route, "/records" and "/database" included, since every path starts
 * with "/"), but `end` means an EXACT match only -- so the Models tab
 * went dark the moment you followed a row into `/models/:className`
 * (`ModelDetail`), even though that page is still very much "Models".
 * Records never had this problem (`/records/:className` already starts
 * with `/records`, which `NavLink`'s own default, non-`end` prefix match
 * already covers) -- but computing all three the same explicit way here
 * keeps the whole strip's own active-state logic in one place instead of
 * two different matching rules for what should be one consistent
 * behavior.
 */
function MainTabs() {
	const { pathname } = useLocation();
	const isModelsActive = '/' === pathname || pathname.startsWith( '/models' );
	const isRecordsActive = pathname.startsWith( '/records' );
	const isDatabaseActive = pathname.startsWith( '/database' );

	return (
		<nav className="nav-tab-wrapper">
			<Link to="/" className={ navTabClass( isModelsActive ) }>
				Models
			</Link>
			<Link to="/records" className={ navTabClass( isRecordsActive ) }>
				Records
			</Link>
			<Link to="/database" className={ navTabClass( isDatabaseActive ) }>
				Database
			</Link>
		</nav>
	);
}

function navTabClass( isActive ) {
	return `nav-tab${ isActive ? ' nav-tab-active' : '' }`;
}
