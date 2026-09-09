import { InnerBlocks } from '@wordpress/block-editor';

/**
 * Save function for the gateway/card-link block -- still a dynamic block
 * (render.php builds the real `<a>`, or no wrapper at all, fresh on
 * every request -- see that file's own docblock, which already says it,
 * not this function, decides whether/how to wrap). Deliberately emits
 * NO markup of its own: the older `useInnerBlocksProps.save()`-wraps-in-
 * a-`<div>` shape every OTHER dynamic InnerBlocks wrapper in this plugin
 * uses (e.g. gateway/single-record's own save.js) is wrong here
 * specifically -- WordPress bakes that wrapper verbatim into $content
 * before render.php ever runs, so a `<div>` here ends up wrapped AGAIN
 * inside render.php's own real `<a>`, producing a visible, unwanted
 * `<a><div>...</div></a>` double-wrap (reported directly). Every other
 * dynamic wrapper block in this plugin has the identical div-in-div
 * shape too, just invisibly -- their own outer wrapper is also a plain,
 * undifferentiated `<div>`, so nothing depends on exact adjacency the
 * way this block's real `<a>` (and, inside a Data Cards grid, its own
 * equal-height CSS) now does.
 *
 * `<InnerBlocks.Content />` -- the older, still fully-supported
 * component API, not the newer `useInnerBlocksProps` hook -- is the
 * standard WordPress pattern for exactly this "save() has no visual
 * markup of its own" case; not used anywhere else in this codebase (a
 * deliberate, one-off exception here, not a pattern to retrofit onto
 * the other, intentionally-wrapped dynamic blocks).
 *
 * See deprecated.js for why this changed shape doesn't break
 * already-published posts still holding the OLD, `<div>`-wrapped markup.
 */
export default function save() {
	return <InnerBlocks.Content />;
}
