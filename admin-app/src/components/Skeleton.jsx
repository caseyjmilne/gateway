/**
 * Shared shimmering placeholder building blocks for this admin app's own
 * "still loading" states -- replacing a bare "Loading…" text line
 * anywhere a shaped placeholder can approximate what's about to appear
 * instead, per a direct request: "everywhere in admin where 'Loading'
 * is shown as text, replace with skeleton." Mirrors the reasoning
 * RecordsCrud.jsx's own (pre-existing) row skeleton already established
 * for a background records reload -- "never a full-page text swap,
 * always a shaped placeholder" -- generalized here into small, reusable
 * pieces so every OTHER screen/component with a "Loading…" line doesn't
 * need to reinvent the same shimmer CSS under its own one-off class
 * names (which is exactly what this plugin's own Date/Time/Datetime
 * field types deliberately avoided doing for their own `cast()`/docblock
 * reasoning elsewhere -- the same "one canonical version, reused" idea
 * applied here to a visual pattern instead of a PHP one).
 *
 * Every piece here is purely visual (`aria-hidden`) -- pair it with a
 * `<span className="screen-reader-text" role="status">…</span>` (WordPress
 * core's own visually-hidden-but-announced utility class) wherever a
 * screen reader genuinely needs to be told loading is happening, the
 * same split RecordsCrud.jsx's own `SkeletonRows`/status-text pair (and
 * ModelDetail.jsx's own page-level skeleton) already use -- this module
 * has no opinion of its own on whether or what to announce, since that
 * wording is different per caller ("Loading models…", "Loading
 * preview…", ...).
 *
 * All three read their own width/sizing from plain CSS (`.gateway-skeleton-*`,
 * admin-app/src/styles.css) rather than inline styles, so every
 * placeholder across the whole app shares one shimmer animation/color
 * defined in exactly one place.
 */

/**
 * One shimmering bar -- the atomic unit every other piece here builds
 * on. A bare inline element on its own (`display: inline-block` in CSS)
 * so it drops into running text/a table cell/a form row exactly like
 * the text it's standing in for would.
 *
 * @param {Object} props
 * @param {string} [props.className] Extra class(es) -- e.g. one of the
 *                   width variants below, or a layout-specific one a
 *                   caller defines for its own placeholder shape.
 */
export function SkeletonBar( { className = '' } ) {
	return (
		<span
			className={ `gateway-skeleton-bar ${ className }`.trim() }
			aria-hidden="true"
		/>
	);
}

/**
 * A vertical stack of full-width-ish bars -- stands in for a few lines
 * of prose/labels/form rows at once (ModelDetail.jsx's own content
 * lines, RelationshipEditor.jsx's own "Add Relationship" row, a form
 * field's own value while it loads).
 *
 * @param {Object} props
 * @param {number} [props.count] How many bars to stack. Default 2.
 */
export function SkeletonLines( { count = 2 } ) {
	return (
		<div className="gateway-skeleton-lines" aria-hidden="true">
			{ Array.from( { length: count } ).map( ( _unused, index ) => (
				<SkeletonBar key={ index } className="gateway-skeleton-line" />
			) ) }
		</div>
	);
}

/**
 * A rectangular shimmering block -- stands in for genuinely block-shaped
 * content a thin text bar wouldn't read as (OEmbedPicker.jsx's own live
 * preview, e.g., which is eventually a real embedded video/rich HTML
 * box, not a line of text).
 */
export function SkeletonBlock( { className = '' } ) {
	return (
		<div
			className={ `gateway-skeleton-block ${ className }`.trim() }
			aria-hidden="true"
		/>
	);
}

/**
 * Stands in for a `<tbody>` while its own table's real rows are still
 * loading -- `rowCount` placeholder `<tr>`s, each `columnCount` cells
 * wide, so the table (headers included, when the caller already knows
 * them) never visibly changes shape once real rows arrive. Column widths
 * vary a little (`nth-child` in CSS) purely so a row reads as placeholder
 * TEXT of differing length rather than one obviously-fake uniform block
 * repeated across every cell -- originally RecordsCrud.jsx's own idea,
 * generalized here for every other table in this app (ModelsList's own
 * Model/Table/Status list, RecordsList's own Model/Rows list) to share
 * rather than each redefining the identical shimmer independently.
 *
 * @param {Object} props
 * @param {number} props.rowCount    How many placeholder rows.
 * @param {number} props.columnCount How many cells per row.
 */
export function SkeletonTableRows( { rowCount, columnCount } ) {
	return (
		<tbody className="gateway-skeleton-table-rows" aria-hidden="true">
			{ Array.from( { length: rowCount } ).map( ( _unused, rowIndex ) => (
				<tr key={ rowIndex }>
					{ Array.from( { length: columnCount } ).map(
						( _unused2, colIndex ) => (
							<td key={ colIndex }>
								<SkeletonBar />
							</td>
						)
					) }
				</tr>
			) ) }
		</tbody>
	);
}
