import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const rootId =
	( typeof window !== 'undefined' && window.GatewayAdmin && window.GatewayAdmin.rootId ) ||
	'gateway-admin-app';

const container = document.getElementById( rootId );

if ( container ) {
	createRoot( container ).render( <App /> );
}
