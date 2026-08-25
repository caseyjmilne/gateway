import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/datatable
 * -page-size and gateway/datatable-search -- no settings of its own, so no
 * InspectorControls.
 *
 * Deliberately no `renderAppender` (this used to pass
 * `InnerBlocks.ButtonBlockAppender`) -- see gateway/datatable-footer's
 * own edit.js for why: it renders its own extra flex child (a floating
 * "+" button) alongside this block's two real children, which breaks the
 * `space-between` layout those two are meant to have (see style.scss)
 * once there are three flex children instead of two to space apart.
 * Leaving `renderAppender` unset falls back to Gutenberg's own default
 * block appender, rendered as part of the block list chrome around the
 * *last* actual child rather than as an extra flex child of this wrapper
 * `<div>` itself.
 */
export default function Edit() {
	const blockProps = useBlockProps();
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [
			'gateway/datatable-page-size',
			'gateway/datatable-search',
		],
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
