/**
 * Save function for the gateway/datatable-body block.
 *
 * A dynamic, leaf block (no children of its own) -- render.php builds the
 * actual `<table>` markup, using context (or, only inside this block's own
 * <ServerSideRender> preview, its mirrored attributes -- see edit.js) for
 * postType/limit/pageSize/columns/facets. save() persists nothing besides
 * the attributes/comment delimiter, same as the facet and pagination
 * blocks.
 */
export default function save() {
	return null;
}
