/**
 * Front-end interactivity for gateway/data-display -- plain vanilla JS,
 * no framework, matching this plugin's own "PHP renders real state up
 * front, JS only ever toggles/interacts" philosophy (see render.php's
 * own docblock). Every child's own detail panel is already rendered,
 * server-side, into the DOM (one `.gateway-data-display__panel` per
 * child, all but the first `hidden`); clicking a sidebar link just
 * toggles which one is visible and which link carries `.is-active` --
 * no fetch, no re-render, ever.
 *
 * Scoped per block instance (`querySelectorAll` within one `.gateway-
 * data-display` wrapper at a time) so more than one of these blocks can
 * exist on the same page without their own child ids -- plain integers,
 * not guaranteed unique across two different Collections -- colliding
 * with each other.
 */

import './style.scss';

function initDataDisplay( container ) {
	const links = container.querySelectorAll( '.gateway-data-display__child-link' );
	const panels = container.querySelectorAll( '.gateway-data-display__panel' );

	const activate = ( childId ) => {
		panels.forEach( ( panel ) => {
			panel.hidden = panel.dataset.childId !== childId;
		} );

		links.forEach( ( link ) => {
			const isActive = link.dataset.childId === childId;
			link.classList.toggle( 'is-active', isActive );
			link.setAttribute( 'aria-current', isActive ? 'true' : 'false' );
		} );
	};

	links.forEach( ( link ) => {
		link.addEventListener( 'click', () => {
			activate( link.dataset.childId );
		} );
	} );
}

document.querySelectorAll( '.gateway-data-display' ).forEach( initDataDisplay );
