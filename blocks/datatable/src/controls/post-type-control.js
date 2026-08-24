/**
 * Post Type select control for the datatable block's Inspector panel.
 *
 * Pulled out into its own component (rather than inlined in edit.js) so it
 * can be reused as-is by future child blocks/settings panels that also need
 * a "which post type" control.
 */

import { SelectControl, Spinner } from '@wordpress/components';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { __ } from '@wordpress/i18n';

// `viewable` (and `labels`) are only exposed by the wp/v2/types endpoint in
// the 'edit' context -- the block editor is always used by a logged-in user
// who can edit content, so 'edit' is safe to request here. Requesting the
// default 'view' context instead leaves `viewable` undefined on every post
// type (silently filtering the list down to nothing).
const QUERY = { per_page: -1, context: 'edit' };

// Post types that are technically viewable/editable but aren't meaningful
// "content" choices for a grid -- WordPress' own Query Loop block excludes
// these for the same reason.
const EXCLUDED_POST_TYPES = [
	'attachment',
	'wp_block',
	'wp_navigation',
	'wp_template',
	'wp_template_part',
	'wp_global_styles',
	'wp_font_family',
	'wp_font_face',
];

export default function PostTypeControl( { value, onChange } ) {
	const { postTypes, hasResolved } = useSelect( ( select ) => {
		const store = select( coreStore );
		return {
			postTypes: store.getPostTypes( QUERY ),
			hasResolved: store.hasFinishedResolution( 'getPostTypes', [ QUERY ] ),
		};
	}, [] );

	if ( ! hasResolved ) {
		return <Spinner />;
	}

	const options = ( postTypes || [] )
		.filter(
			( postType ) =>
				postType.viewable && ! EXCLUDED_POST_TYPES.includes( postType.slug )
		)
		.map( ( postType ) => ( {
			label: postType.name,
			value: postType.slug,
		} ) );

	if ( ! options.length ) {
		options.push( { label: __( 'Posts', 'gateway' ), value: 'post' } );
	}

	return (
		<SelectControl
			label={ __( 'Post Type', 'gateway' ) }
			value={ value }
			options={ options }
			onChange={ onChange }
		/>
	);
}
