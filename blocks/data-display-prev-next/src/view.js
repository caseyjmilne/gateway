import './style.scss';

/**
 * Front-end wiring for gateway/data-display-prev-next -- see render.php's
 * own docblock for why this can't be computed server-side, and for the
 * high-level "read the already-rendered menu" technique this implements.
 *
 * Runs once per instance, on load, and never again: which RECORD a given
 * instance belongs to is fixed forever (it's baked into the specific
 * `.gateway-data-display__panel` this instance happens to be nested
 * inside, one of the N identical copies gateway/data-display's own
 * render.php produces -- one per child, all but one `hidden`); only
 * which PANEL is currently VISIBLE ever changes, and that's already
 * handled entirely by gateway/data-display's own view.js toggling
 * `hidden` on the whole panel -- this instance's own Previous/Next links
 * ride along with whatever panel they're already inside, no separate
 * hashchange listener of this file's own needed at all.
 *
 * @param {HTMLElement} nav This block's own wrapper element.
 */
function initPrevNext( nav ) {
	const panel = nav.closest( '.gateway-data-display__panel' );
	const dataDisplay = nav.closest( '.gateway-data-display' );

	// Not actually nested inside a real Data Display instance (a
	// hand-edited post_content, or this block rendered some other way
	// entirely) -- both links stay `hidden` exactly as render.php left
	// them, rather than erroring.
	if ( ! panel || ! dataDisplay ) {
		return;
	}

	const mySlug = panel.dataset.childSlug;

	// The "menu" -- every child's own sidebar link, in the exact same
	// order gateway/data-display's own render.php built the sidebar in
	// (which is also $all_children's own order -- one flat sequence
	// spanning every group, not scoped to just this child's own group).
	// This is the single source of truth for both ordering AND each
	// child's own real href/title -- nothing here is recomputed.
	const menuLinks = Array.prototype.slice.call(
		dataDisplay.querySelectorAll( '.gateway-data-display__child-link' )
	);
	const myIndex = menuLinks.findIndex(
		( link ) => link.dataset.childSlug === mySlug
	);

	// This instance's own panel doesn't correspond to any menu entry at
	// all (shouldn't happen -- every panel gateway/data-display renders
	// has a matching sidebar link -- but never assume that holds).
	if ( -1 === myIndex ) {
		return;
	}

	/**
	 * @param {HTMLAnchorElement|null} linkEl    This block's own <a> --
	 *                                            null if render.php's
	 *                                            markup was somehow
	 *                                            missing it.
	 * @param {HTMLAnchorElement|null} menuLink  The sibling menu <a> to
	 *                                            copy from, or null at
	 *                                            the very first/last item.
	 */
	const applyLink = ( linkEl, menuLink ) => {
		if ( ! linkEl ) {
			return;
		}

		// Gracefully handles the first (no previous) / last (no next)
		// item -- simply never shown, rather than a dead link or a
		// disabled-looking one.
		if ( ! menuLink ) {
			linkEl.hidden = true;
			return;
		}

		linkEl.href = menuLink.getAttribute( 'href' );

		const titleEl = linkEl.querySelector(
			'.gateway-data-display-prev-next__title'
		);

		if ( titleEl ) {
			// The menu link's own text IS that item's own title (render.php's
			// sidebar builds it from the exact same record_option() label
			// this app already treats as a record's own display title) --
			// no separate title lookup of any kind.
			titleEl.textContent = menuLink.textContent;
		}

		linkEl.hidden = false;
	};

	applyLink(
		nav.querySelector( '.gateway-data-display-prev-next__link--prev' ),
		menuLinks[ myIndex - 1 ] ?? null
	);
	applyLink(
		nav.querySelector( '.gateway-data-display-prev-next__link--next' ),
		menuLinks[ myIndex + 1 ] ?? null
	);
}

document
	.querySelectorAll( '.gateway-data-display-prev-next' )
	.forEach( initPrevNext );
