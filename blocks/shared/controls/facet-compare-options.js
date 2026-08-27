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
