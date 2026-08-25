import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/pagination
 * and gateway/datatable-results -- no settings of its own, so no
 * InspectorControls.
 *
 * Deliberately no `renderAppender` (this used to pass
 * `InnerBlocks.ButtonBlockAppender`): that renders its own extra flex
 * child -- a floating "+" button -- alongside Pagination and Results,
 * which broke the `space-between`/`nowrap` layout those two are meant to
 * have (see style.scss): three children under `space-between` puts the
 * middle one in the middle of the row rather than the other two staying
 * at the opposite ends they're meant to. Leaving `renderAppender` unset
 * falls back to Gutenberg's own default block appender -- rendered as
 * part of the block list chrome around the *last* actual child, not as an
 * extra flex child of this wrapper `<div>` itself -- so it can no longer
 * compete for a spot in that layout.
 *
 * `useBlockProps( { className: 'gateway-datatable-footer' } )` -- NOT bare
 * `useBlockProps()` -- is the actual fix for the layout not applying in
 * the editor at all (reported after the two fixes above still didn't help):
 * `save.js` passes that className to its own `useBlockProps.save()`, but
 * this file's `useBlockProps()` never did, so the editor's rendered
 * wrapper only ever carried WordPress's own generated classes
 * (`wp-block-gateway-datatable-footer`, `wp-block`, ...) -- never
 * `gateway-datatable-footer`, the one class `style.scss`'s `display:
 * flex`/`justify-content`/etc. actually target. No flex rule ever applied
 * in the editor at all; children just stacked as ordinary block-level
 * flow, which is what "the second item falls under the first" actually
 * was, independent of `flex-wrap` or the appender.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-datatable-footer' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/pagination', 'gateway/datatable-results' ],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
