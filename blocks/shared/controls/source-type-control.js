/**
 * "Post Type" vs "Collection" (Gateway model data) source picker -- the
 * first choice made in a data-driven block's own settings, before either
 * PostTypeControl or CollectionControl is even shown.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const OPTIONS = [
	{ label: __( 'Post Type', 'gateway' ), value: 'postType' },
	{ label: __( 'Collection', 'gateway' ), value: 'collection' },
];

export default function SourceTypeControl( { value, onChange } ) {
	return (
		<SelectControl
			label={ __( 'Source', 'gateway' ) }
			value={ value }
			options={ OPTIONS }
			onChange={ onChange }
		/>
	);
}
