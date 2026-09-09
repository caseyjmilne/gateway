import { useInnerBlocksProps } from '@wordpress/block-editor';

/**
 * v1: save() wrapped InnerBlocks in a bare `<div>` with no class of its
 * own -- baked verbatim into render.php's own $content (WordPress never
 * discards a dynamic block's own save() markup before calling its render
 * callback), which then re-wrapped that AGAIN in the real, dynamically
 * -built `<a>`, producing a visible, unwanted `<a><div>...</div></a>`
 * double-wrap -- reported directly. Fixed in save.js by dropping this
 * wrapper entirely (`<InnerBlocks.Content />`, letting render.php be the
 * sole, already-conditional source of any wrapper element -- its own
 * docblock already said as much).
 *
 * This entry exists purely so an already-published post's own stored
 * markup (which still has literally this same bare `<div>`, unchanged --
 * a deprecation never rewrites storage) keeps being recognized as valid,
 * rather than the editor showing "this block contains unexpected or
 * invalid content." A post using this block picks up the new, div-free
 * shape (and, inside a Data Cards grid, the full benefit of that block's
 * own equal-height CSS) the next time an editor actually re-saves it --
 * see blocks/data-cards-body/src/style.scss's own `div:not([class])`
 * rule for how the front end stays correct even before that happens.
 *
 * No `migrate()` -- this block has never declared any attributes, so
 * there's nothing for one to carry forward.
 */
const v1 = {
	attributes: {},
	save() {
		const innerBlocksProps = useInnerBlocksProps.save();

		return <div { ...innerBlocksProps } />;
	},
};

export default [ v1 ];
