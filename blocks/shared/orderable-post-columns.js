/**
 * The JS-side counterpart of `Column_Registry::ORDERABLE_CORE_COLUMNS` --
 * maps a gateway/data-cards Order By column key (a `WP_Post` property
 * name, e.g. `post_title`) to the `orderby` token the `wp/v2/<post_type>`
 * REST collection endpoint itself actually accepts (`title`), used by
 * gateway/data-cards-body's own editor preview fetch
 * (`getEntityRecords()`) so the preview runs the SAME real, server-side
 * ordered query the front end does, rather than a fake client-side resort
 * over whatever the default-ordered fetch happened to return.
 *
 * Kept as a separate, hand-written map rather than derived from the PHP
 * side at build time: every value here already matches
 * `Column_Registry::ORDERABLE_CORE_COLUMNS`'s own (`WP_Query`-native)
 * values for every column BOTH lists carry -- `comment_count` is the one
 * PHP has and this doesn't, excluded there for exactly this file's own
 * reason (see that const's own docblock): the REST endpoint's `orderby`
 * enum has never included it.
 */
export const POST_ORDERBY_REST_TOKENS = {
	ID: 'id',
	post_title: 'title',
	post_date: 'date',
	post_modified: 'modified',
	post_author: 'author',
	post_name: 'slug',
	post_parent: 'parent',
	menu_order: 'menu_order',
};
