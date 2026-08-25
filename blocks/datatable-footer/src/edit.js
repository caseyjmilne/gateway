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
 */
export default function Edit() {
	const blockProps = useBlockProps();
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/pagination', 'gateway/datatable-results' ],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
