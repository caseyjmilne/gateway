import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';

export default function save() {
	const blockProps = useBlockProps.save( {
		className: 'gateway-datatable-facets',
	} );
	const innerBlocksProps = useInnerBlocksProps.save( blockProps );

	return <div { ...innerBlocksProps } />;
}
