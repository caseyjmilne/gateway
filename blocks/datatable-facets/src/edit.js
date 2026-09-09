import {
	useBlockProps,
	useInnerBlocksProps,
	InnerBlocks,
} from '@wordpress/block-editor';

/**
 * Just an editable InnerBlocks container restricted to gateway/facet and
 * gateway/facet-has-value -- no settings of its own, so no
 * InspectorControls.
 *
 * `useBlockProps( { className: 'gateway-datatable-facets' } )` -- see
 * gateway/datatable-footer's own edit.js for why this, not bare
 * `useBlockProps()`, is what actually makes `style.scss`'s flex layout
 * apply in the editor at all: `save.js` passes that className to its own
 * `useBlockProps.save()`; this file didn't, so the editor's wrapper never
 * carried the one class `style.scss` targets.
 *
 * `gateway/facet-has-value` missing from `allowedBlocks` here (left out
 * when that block was first added) didn't stop it from being inserted
 * (it can also be reached via the global inserter/slash command, which
 * only checks its own `parent` -- ["gateway/datatable-facets"] -- not
 * this container's own allow-list) or from rendering correctly once
 * present; the one real, visible effect was this block's OWN "+" appender
 * button never offering it as a choice, unlike gateway/data-cards' own
 * unrestricted facets area (a plain core/group, no allow-list at all --
 * see README.md's "Preferring core blocks over bespoke containers"),
 * which is why the same block reads as fully working there already.
 * `gateway/facet-text` is included here from the start for the same
 * "+" appender convenience.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-datatable-facets' } );
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		allowedBlocks: [ 'gateway/facet', 'gateway/facet-has-value', 'gateway/facet-text' ],
		renderAppender: InnerBlocks.ButtonBlockAppender,
		templateLock: false,
	} );

	return <div { ...innerBlocksProps } />;
}
