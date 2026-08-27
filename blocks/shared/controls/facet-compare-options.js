/**
 * Comparison operators offered for a facet, and their friendly labels.
 *
 * The `value` of each option is exactly the operator string WP_Query's
 * `meta_query` (and Facet_Query::filter_posts_where() for core fields on
 * the PHP side) expects for `compare` -- kept as a shared, explicit list
 * here (rather than derived) so the two stay in lockstep by inspection.
 */

import { __ } from '@wordpress/i18n';

export const FACET_COMPARE_OPTIONS = [
	{ label: __( 'Equals', 'gateway' ), value: '=' },
	{ label: __( 'Not Equals', 'gateway' ), value: '!=' },
	{ label: __( 'Greater Than', 'gateway' ), value: '>' },
	{ label: __( 'Greater Than or Equal', 'gateway' ), value: '>=' },
	{ label: __( 'Less Than', 'gateway' ), value: '<' },
	{ label: __( 'Less Than or Equal', 'gateway' ), value: '<=' },
	{ label: __( 'Contains', 'gateway' ), value: 'LIKE' },
	{ label: __( 'Does Not Contain', 'gateway' ), value: 'NOT LIKE' },
];

export const DEFAULT_FACET_COMPARE = '=';

/**
 * The two-entry subset of FACET_COMPARE_OPTIONS gateway/facet's own live
 * (front-end) CompareControl usage offers -- see that control's own
 * docblock for why: DataTables' client-side `column().search()` can only
 * do a substring or exact-match search, no real numeric/date comparison,
 * so "Greater Than" etc. would be a choice the Data Table's live
 * interaction can't actually back up. Same underlying `value`s
 * ('LIKE'/'=') as their FACET_COMPARE_OPTIONS entries -- one vocabulary
 * plugin-wide, just a narrower menu here.
 */
export const STRING_ONLY_COMPARE_OPTIONS = [
	{ label: __( 'Contains', 'gateway' ), value: 'LIKE' },
	{ label: __( 'Equals', 'gateway' ), value: '=' },
];

export const DEFAULT_STRING_ONLY_COMPARE = 'LIKE';
