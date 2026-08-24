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

const QUERY = { per_page: -1, context: 'view' };

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
		.filter( ( postType ) => postType.viewable )
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
