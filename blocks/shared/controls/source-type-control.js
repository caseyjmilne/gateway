/**
 * "Post Type" vs "Collection" (Gateway model data) source picker -- the
 * first choice made in a data-driven block's own settings, before either
 * PostTypeControl or CollectionControl is even shown.
 */

import { SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const OPTIONS = [
	{ label: __( 'Post Type', 'gateway' ), value: 'postType' },
	// Label only -- the stored value stays 'collection' (matches every
	// existing block's own already-serialized sourceType attribute, and
	// every 'collection' === sourceType check throughout this plugin);
	// "Model" is just the user-facing term this plugin uses everywhere
	// else for the exact same concept, per a direct request to stop
	// saying "Collection" in the editor.
	{ label: __( 'Model', 'gateway' ), value: 'collection' },
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
