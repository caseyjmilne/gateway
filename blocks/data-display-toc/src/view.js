import './style.scss';

/**
 * Front-end wiring for gateway/data-display-toc -- see render.php's own
 * docblock for why this can't be computed server-side, and for the
 * high-level technique. Runs once per instance, on load, and never
 * again -- same reasoning as gateway/data-display-prev-next's own
 * view.js: which panel (and therefore which headings) a given instance
 * belongs to never changes after render, only which panel is currently
 * visible does, already handled by gateway/data-display's own existing
 * view.js.
 *
 * Honors the block's own OPTIONAL "only parse these fields" setting
 * (edit.js's own FormTokenField) via `data-field-keys` -- see
 * collectHeadings()'s own docblock for the full mechanics.
 */

const HEADING_SELECTOR = 'h2, h3, h4, h5, h6';

/**
 * A plain JS equivalent of PHP's `sanitize_title()` -- lowercase,
 * non-alphanumeric runs collapsed to a single hyphen, leading/trailing
 * hyphens trimmed. Only needs to be "good enough" for a same-page
 * anchor id, not a real, portable URL slug.
 *
 * @param {string} text
 * @return {string}
 */
function slugify( text ) {
	return text
		.toLowerCase()
		.trim()
		.replace( /[^a-z0-9]+/g, '-' )
		.replace( /^-+|-+$/g, '' );
}

/**
 * Returns `base` itself if it's not already in `used`, else the first
 * `base-2`, `base-3`, ... variant that isn't -- the same "auto-append a
 * numeric suffix on collision" convention
 * `Model_Fields::resolve_permalink_value()` already uses server-side for
 * a record's own Permalink field. Mutates `used` to include whatever it
 * returns, so a caller never has to remember to do that itself.
 *
 * @param {string} base
 * @param {Set<string>} used
 * @return {string}
 */
function uniqueId( base, used ) {
	const root = base || 'section';
	let candidate = root;
	let suffix = 2;

	while ( used.has( candidate ) ) {
		candidate = `${ root }-${ suffix }`;
		suffix += 1;
	}

	used.add( candidate );
	return candidate;
}

/**
 * Builds one nested `<ul>` of `<li><a href="#...">` entries from a flat,
 * DOM-order list of heading elements (each already carrying a real
 * `id`) -- the standard "flat heading list -> indented outline" walk: a
 * deeper level nests a new `<ul>` inside the previous entry's own
 * `<li>`; a shallower level pops back up; same level is just another
 * sibling `<li>` in whatever list is currently open.
 *
 * @param {HTMLHeadingElement[]} headings
 * @param {Document} doc
 * @return {HTMLUListElement}
 */
function buildList( headings, doc ) {
	const root = doc.createElement( 'ul' );
	const stack = [ { level: 2, listEl: root } ];

	headings.forEach( ( heading ) => {
		const level = Number( heading.tagName.slice( 1 ) ); // "H3" -> 3

		while ( stack.length > 1 && level < stack[ stack.length - 1 ].level ) {
			stack.pop();
		}

		if ( level > stack[ stack.length - 1 ].level ) {
			const parentList = stack[ stack.length - 1 ].listEl;
			const lastItem = parentList.lastElementChild;
			const nestedList = doc.createElement( 'ul' );

			// An H4 (say) appearing before any H3 sibling has no real
			// item to nest under yet -- append the new list directly so
			// the heading still shows, rather than dropping it.
			( lastItem || parentList ).appendChild( nestedList );

			stack.push( { level, listEl: nestedList } );
		}

		const item = doc.createElement( 'li' );
		const link = doc.createElement( 'a' );
		link.href = `#${ heading.id }`;
		link.textContent = heading.textContent;
		item.appendChild( link );
		stack[ stack.length - 1 ].listEl.appendChild( item );
	} );

	return root;
}

/**
 * Every heading this instance should list, in real DOM order -- either
 * "everything in the panel" (the default, unrestricted, behavior) or,
 * when render.php's own `data-field-keys` names one or more fields,
 * ONLY headings found within one of those specific fields' own
 * rendered value (concretely: inside a `gateway/card-field-text`
 * instance whose own `data-field-key` matches one of them -- see that
 * block's own render.php). A hand-placed `core/heading`, or a heading
 * from an unrelated `gateway/related-items` loop, is deliberately
 * excluded once this restriction is configured -- that's the whole
 * point of naming specific fields.
 *
 * @param {HTMLElement} panel     This instance's own enclosing
 *                                  `.gateway-data-display__panel`.
 * @param {HTMLElement} nav       This block's own wrapper element --
 *                                  excluded from the scan either way.
 * @param {string[]}    fieldKeys From `data-field-keys`, already split/
 *                                  filtered -- empty means unrestricted.
 * @return {HTMLHeadingElement[]}
 */
function collectHeadings( panel, nav, fieldKeys ) {
	if ( 0 === fieldKeys.length ) {
		return Array.prototype.filter.call(
			panel.querySelectorAll( HEADING_SELECTOR ),
			// Excludes any heading that might somehow live INSIDE this TOC
			// widget's own markup (it doesn't today -- render.php uses a
			// plain <p> for its own label specifically to avoid this case
			// -- but never assume a future edit couldn't introduce one).
			( heading ) => ! nav.contains( heading )
		);
	}

	const seen = new Set();
	const headings = [];

	fieldKeys.forEach( ( fieldKey ) => {
		panel
			.querySelectorAll( `[data-field-key="${ CSS.escape( fieldKey ) }"]` )
			.forEach( ( fieldWrapper ) => {
				fieldWrapper.querySelectorAll( HEADING_SELECTOR ).forEach( ( heading ) => {
					if ( ! seen.has( heading ) ) {
						seen.add( heading );
						headings.push( heading );
					}
				} );
			} );
	} );

	// Multiple fields' own wrappers are visited in the order THIS
	// BLOCK'S OWN ATTRIBUTE lists them, not necessarily the order they
	// actually appear on the page -- restore real DOM order before
	// building the list, the same order a reader would actually
	// encounter these headings scrolling down the page.
	return headings.sort( ( a, b ) =>
		// eslint-disable-next-line no-bitwise
		a.compareDocumentPosition( b ) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
	);
}

/**
 * @param {HTMLElement} nav This block's own wrapper element.
 */
function initToc( nav ) {
	const panel = nav.closest( '.gateway-data-display__panel' );

	// Not actually nested inside a real Data Display panel -- stays
	// `hidden` exactly as render.php left it, rather than erroring.
	if ( ! panel ) {
		return;
	}

	const fieldKeys = ( nav.dataset.fieldKeys || '' )
		.split( ',' )
		.map( ( key ) => key.trim() )
		.filter( Boolean );

	const headings = collectHeadings( panel, nav, fieldKeys );

	// Nothing to link to -- leave the whole widget hidden rather than
	// showing an empty "On This Page" box.
	if ( 0 === headings.length ) {
		return;
	}

	const usedIds = new Set(
		Array.prototype.map.call( panel.querySelectorAll( '[id]' ), ( el ) => el.id )
	);

	// Namespaced by this panel's own child slug (falling back to its id)
	// -- EVERY child's own full detail template is rendered onto the
	// SAME page at once (gateway/data-display's own render.php, one
	// panel per child, all but one `hidden`), so two different children
	// each starting with an identical "Overview" heading would otherwise
	// collide on the exact same auto-generated id, and an anchor link
	// would only ever be able to reach whichever one happens to come
	// first in the DOM.
	const panelNamespace = panel.dataset.childSlug || String( panel.dataset.childId || '' );

	headings.forEach( ( heading ) => {
		// A site owner who already gave this heading a real id by hand
		// (the block editor's own "HTML anchor" field, on whatever block
		// produced it) keeps it untouched.
		if ( heading.id ) {
			usedIds.add( heading.id );
			return;
		}

		heading.id = uniqueId( `${ panelNamespace }--${ slugify( heading.textContent ) }`, usedIds );
	} );

	const listContainer = nav.querySelector( '.gateway-data-display-toc__list' );

	if ( ! listContainer ) {
		return;
	}

	listContainer.appendChild( buildList( headings, nav.ownerDocument ) );
	nav.hidden = false;
}

document.querySelectorAll( '.gateway-data-display-toc' ).forEach( initToc );
