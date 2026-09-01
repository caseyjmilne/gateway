import { HOME_URL } from '../api.js';

// Mirrors FieldEditor.jsx's/PermalinkEditor.jsx's own normalizeSettings() --
// same defensive reason: a field with no settings configured yet can arrive
// as `[]`, not `{}`. See either of those components' own docblocks for the
// full story.
const normalizeSettings = ( settings ) =>
	settings && ! Array.isArray( settings ) ? settings : {};

/**
 * The one canonical answer to "what's this record's own real front-end
 * URL, if it has one" -- read by both RecordsCrud.jsx's own table (a View
 * link per row) and its Edit modal (the same link shown at the top, the
 * classic WordPress "Permalink: ... View" chrome under a post's own
 * title).
 *
 * A record only has a real URL once its model's Permalink field is fully
 * routed: Root AND Template Page both configured (`PermalinkEditor.jsx`'s
 * own copy already tells the site owner this exact requirement --
 * "Both Root and Template Page are required before this model's records
 * are reachable at their own URL") -- `Permalink_Routes::register_rules()`
 * never registers a rewrite rule for a model missing either one, so a link
 * built from Root alone would just 404. `template_page_id` is otherwise
 * unused here (the record's own URL never embeds it), it's purely the
 * gate for whether a route exists at all.
 *
 * The slug itself is just the permalink field's own plain stored value
 * (`Model_Fields::resolve_permalink_value()` already made it URL-safe and
 * unique server-side, whether Auto- or Manual-mode) -- no client-side
 * slugifying happens here, unlike `PermalinkControl.jsx`'s own *live
 * preview* while a record is still being edited, which has no saved slug
 * yet to read.
 *
 * @param {Array}  fields A model's own fields (`ModelDetail`'s/
 *                         `RecordsCrud`'s already-fetched `model.fields`).
 * @param {object} record One of that model's own records, as returned by
 *                         the records list/detail endpoints.
 * @return {string|null} A real, absolute front-end URL, or null if this
 *                         model has no Permalink field, isn't fully
 *                         routed yet, or this particular record has no
 *                         slug yet (e.g. never saved).
 */
export function getRecordPermalink( fields, record ) {
	const permalinkField = ( fields || [] ).find(
		( field ) => 'permalink' === field.type
	);

	if ( ! permalinkField || ! record ) {
		return null;
	}

	const settings = normalizeSettings( permalinkField.settings );
	const root = ( settings.root || '' ).trim();

	if ( ! root || ! settings.template_page_id ) {
		return null;
	}

	const slug = record[ permalinkField.name ];

	if ( ! slug ) {
		return null;
	}

	const base = ( HOME_URL || '' ).replace( /\/+$/, '' );

	return `${ base }/${ root }/${ encodeURIComponent( slug ) }`;
}
