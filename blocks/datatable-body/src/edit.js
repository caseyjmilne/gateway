import { useEffect, useMemo, useRef } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import {
	useBlockProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import ServerSideRender from '@wordpress/server-side-render';

import { useDataTableInit } from './hooks/use-datatable-init';

/**
 * <ServerSideRender> only ever sends whatever `attributes` object it's given
 * to the block-renderer REST endpoint -- never this block's inherited
 * context -- so `render.php` can't rely on gateway/datatable's context
 * reaching it through that specific preview call the way it reliably does
 * on every real render (front end, or this block rendered as part of a full
 * page load).
 *
 * `previewAttributes` (below) is the fix: it's computed fresh from *live*
 * context on every render and passed to <ServerSideRender> directly --
 * never read from this block's own persisted `attributes`. An earlier
 * version instead mirrored context into this block's own attributes via
 * `setAttributes()`, gated the preview behind an `isSynced` check, and
 * showed a Spinner until that async mirror caught up. That mirror wasn't
 * reliably taking effect -- reported as "every column is sortable even
 * when Sortable is turned off in the settings", reproduced as the
 * *editor* preview specifically (the front end, which reads live context
 * directly with no mirroring involved, was correct). The rendered
 * `<th data-orderable="true">` the report included matches this block's
 * own block.json *default* value for `columns`
 * (`[{ key: "ID", sortable: true }, { key: "post_title", sortable: true }]`)
 * exactly -- meaning the mirrored copy of `columns` was stuck at that
 * default and never actually being updated, regardless of what the parent
 * block's Columns panel said. Computing the preview's attributes directly
 * from context, every render, removes the entire mirror-then-render
 * dependency for what's actually shown: the preview can only ever be
 * *correct* now, not correct-once-the-mirror-eventually-catches-up.
 *
 * The `setAttributes()` mirror is still kept below, best-effort: it gives
 * this block's own *persisted* attributes a reasonable fallback for the
 * rare case something renders it via ServerSideRender without this
 * component's own live context available (e.g. WordPress's own post
 * -preview/revision-diff routes) -- but nothing about the editor's visible
 * preview depends on it succeeding any more.
 */
export default function Edit( { attributes, setAttributes, context } ) {
	const blockProps = useBlockProps();
	const previewRef = useRef();
	const { __unstableMarkNextChangeAsNotPersistent } =
		useDispatch( blockEditorStore );

	const postType = context[ 'gateway/datatable/postType' ] || 'post';
	const limit = context[ 'gateway/datatable/limit' ] || 0;
	const pageSize = context[ 'gateway/datatable/pageSize' ] || 10;
	const columns = context[ 'gateway/datatable/columns' ] || [];
	const facets = context[ 'gateway/datatable/facets' ] || [];

	// What <ServerSideRender> actually renders with -- see the docblock
	// above. Memoized so it only changes (and only triggers a refetch)
	// when the underlying values genuinely do, not on every render.
	const previewAttributes = useMemo(
		() => ( { postType, limit, pageSize, columns, facets } ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ postType, limit, pageSize, JSON.stringify( columns ), JSON.stringify( facets ) ]
	);

	useEffect( () => {
		const isSynced =
			attributes.postType === postType &&
			attributes.limit === limit &&
			attributes.pageSize === pageSize &&
			JSON.stringify( attributes.columns ) === JSON.stringify( columns ) &&
			JSON.stringify( attributes.facets ) === JSON.stringify( facets );

		if ( ! isSynced ) {
			// This is a derived sync, not a user edit: marking it non
			// -persistent keeps opening a post with a datatable block in it
			// from immediately showing "unsaved changes" purely because this
			// effect ran on mount, and keeps it out of undo history (there's
			// nothing here a user would ever want to "undo" back to a prior
			// state of -- the real, undoable source of truth is the parent's
			// own attributes, unaffected by this).
			__unstableMarkNextChangeAsNotPersistent( { history: 'ignore' } );
			setAttributes( { postType, limit, pageSize, columns, facets } );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		postType,
		limit,
		pageSize,
		JSON.stringify( columns ),
		JSON.stringify( facets ),
	] );

	// Re-run whenever the rendered preview could change shape/content.
	useDataTableInit( previewRef, [
		postType,
		limit,
		pageSize,
		JSON.stringify( columns ),
		JSON.stringify( facets ),
	] );

	return (
		<div { ...blockProps }>
			<div className="gateway-datatable-preview" ref={ previewRef }>
				<ServerSideRender
					block="gateway/datatable-body"
					attributes={ previewAttributes }
				/>
			</div>
		</div>
	);
}
