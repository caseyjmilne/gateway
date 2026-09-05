/**
 * Front-end interactivity for gateway/data-display -- plain vanilla JS,
 * no framework, matching this plugin's own "PHP renders real state up
 * front, JS only ever toggles/interacts" philosophy (see render.php's
 * own docblock). Every child's own detail panel is already rendered,
 * server-side, into the DOM (one `.gateway-data-display__panel` per
 * child, all but the first `hidden`).
 *
 * Which child is shown is driven entirely by `window.location.hash`, a
 * "hashbang" fragment of the form `#!/{related model slug}/{slug}` --
 * see render.php's own docblock for how `{related model slug}` and
 * `{slug}` are each computed and why (the former is the related model's
 * own auto-generated permalink slug, e.g. `PortfolioItem` ->
 * `portfolio-item` -- the same one used for that model's own admin
 * `#/records/{slug}` URL -- never the raw class name). Each sidebar
 * link is a real `<a href="#!/...">`, so clicking one updates the hash
 * and fires a native `hashchange` event entirely on its own; no click
 * handler of this file's own is involved at all. That's also exactly
 * what makes an external page (or a saved bookmark) able to link
 * straight to one specific child: this same `hashchange` listener, plus
 * one read of an already-present hash on load, is the ONLY thing that
 * decides which panel is visible -- a plain page load with no hash at
 * all leaves render.php's own server-picked first child showing,
 * untouched.
 *
 * Scoped per block instance (`querySelectorAll` within one `.gateway-
 * data-display` wrapper at a time) so more than one of these blocks can
 * exist on the same page without their own child ids/slugs -- not
 * guaranteed unique across two different Collections -- colliding with
 * each other; each instance also checks the hash's own `{related model
 * slug}` segment against its own `data-related-collection` before ever
 * acting on it, so a hash belonging to a DIFFERENT block (or an
 * unrelated feature entirely) is simply ignored.
 */

import './style.scss';

/**
 * @param {string} hash `window.location.hash`, e.g. "#!/portfolio-item/ticket-one".
 * @return {{collection: string, slug: string}|null} Parsed segments, or
 *         `null` for any hash this block doesn't own at all (empty, a
 *         plain `#anchor`, or a hashbang with no `/{slug}` segment).
 */
function parseHash( hash ) {
	if ( ! hash.startsWith( '#!' ) ) {
		return null;
	}

	// The leading '/' is optional -- '#!/Ticket/ticket-one' and
	// '#!Ticket/ticket-one' parse identically.
	const path = hash.slice( 2 ).replace( /^\//, '' );
	const slashIndex = path.indexOf( '/' );

	if ( -1 === slashIndex ) {
		return null;
	}

	return {
		collection: decodeURIComponent( path.slice( 0, slashIndex ) ),
		slug: decodeURIComponent( path.slice( slashIndex + 1 ) ),
	};
}

function initDataDisplay( container ) {
	const collection = container.dataset.relatedCollection;
	const links = container.querySelectorAll( '.gateway-data-display__child-link' );
	const panels = container.querySelectorAll( '.gateway-data-display__panel' );

	const activateBySlug = ( slug ) => {
		const panel = Array.prototype.find.call(
			panels,
			( candidate ) => candidate.dataset.childSlug === slug
		);

		// An unrecognized slug (a stale bookmark to a since-deleted
		// child, a typo'd external link) leaves whatever is currently
		// showing alone -- render.php's own server-picked first child,
		// on a fresh load -- rather than blanking the whole panel.
		if ( ! panel ) {
			return;
		}

		panels.forEach( ( candidate ) => {
			candidate.hidden = candidate !== panel;
		} );

		links.forEach( ( link ) => {
			const isActive = link.dataset.childSlug === slug;
			link.classList.toggle( 'is-active', isActive );
			link.setAttribute( 'aria-current', isActive ? 'true' : 'false' );
		} );
	};

	const syncFromHash = () => {
		const parsed = parseHash( window.location.hash );

		if ( parsed && parsed.collection === collection ) {
			activateBySlug( parsed.slug );
		}
	};

	window.addEventListener( 'hashchange', syncFromHash );
	// Picks up a hash already present on load -- a direct, external link
	// straight to one child.
	syncFromHash();
}

document.querySelectorAll( '.gateway-data-display' ).forEach( initDataDisplay );
