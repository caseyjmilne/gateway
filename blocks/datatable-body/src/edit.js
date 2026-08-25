import { useEffect, useRef } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import {
	useBlockProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import ServerSideRender from '@wordpress/server-side-render';

import { useDataTableInit } from './hooks/use-datatable-init';

/**
 * <ServerSideRender> only ever sends a block's own top-level *attributes* to
 * the block-renderer REST endpoint -- never the context it inherits from a
 * parent -- so this block's own render.php can't rely on
 * gateway/datatable's context reaching it through that specific preview
 * call the way it reliably does on every real render (front end, or this
 * block rendered as part of a full page load). Mirroring context into this
 * block's own (otherwise-unused) attributes whenever it changes gives the
 * preview call something equivalent to send instead; render.php always
 * prefers real context when it's available; these attributes only matter
 * for this one gap.
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

	// setAttributes() below is async (a re-render away), so on the render
	// right after context changes, `attributes` still reflects the *previous*
	// sync -- rendering <ServerSideRender> with it would flash a stale (or,
	// on first mount, default-value) preview for a moment. isSynced gates
	// that: a Spinner shows instead until attributes actually match the
	// context that's meant to drive them.
	const isSynced =
		attributes.postType === postType &&
		attributes.limit === limit &&
		attributes.pageSize === pageSize &&
		JSON.stringify( attributes.columns ) === JSON.stringify( columns ) &&
		JSON.stringify( attributes.facets ) === JSON.stringify( facets );

	useEffect( () => {
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
				{ isSynced ? (
					<ServerSideRender
						block="gateway/datatable-body"
						attributes={ attributes }
					/>
				) : (
					<Spinner />
				) }
			</div>
		</div>
	);
}
