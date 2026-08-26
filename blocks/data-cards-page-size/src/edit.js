import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

import { buildLengthMenu } from '../../shared/length-menu';

/**
 * A real (but non-interactive) preview, using the parent's actual Page
 * Size context to compute the same length menu render.php does --
 * gateway/data-cards-page-size doesn't need a *live* editor sync the way
 * gateway/datatable-page-size does (see that block's own edit.js docblock):
 * there's no live DataTables instance equivalent for gateway/data-cards to
 * sync with in the editor at all (gateway/data-cards-body's own editor
 * preview is real InnerBlocks + useBlockPreview editing, not a server
 * -rendered grid -- see its own edit.js), but context alone is already
 * everything render.php itself needs, so the preview can still be
 * accurate rather than a hardcoded placeholder list.
 *
 * @param {Object} props
 * @param {Object} props.context Block context (usesContext in block.json).
 */
export default function Edit( { context } ) {
	const pageSize = context[ 'gateway/data-cards/pageSize' ] || 12;
	const blockProps = useBlockProps( { className: 'gateway-data-cards-page-size' } );
	const lengthMenu = buildLengthMenu( pageSize );

	return (
		<div { ...blockProps }>
			<select
				className="gateway-data-cards-page-size__select"
				disabled
				defaultValue={ pageSize }
			>
				{ lengthMenu.map( ( length ) => (
					<option key={ length } value={ length }>
						{ length }
					</option>
				) ) }
			</select>
			<label>{ __( 'entries per page', 'gateway' ) }</label>
		</div>
	);
}
