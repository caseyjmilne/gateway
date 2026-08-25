import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- the real, interactive Prev/Next/page
 * -number control only exists on the front end (view.js), hooked into an
 * actual DataTable instance (see gateway/facet's FacetPreview for the same
 * reasoning). No settings to configure yet, so no InspectorControls.
 */
export default function Edit() {
	const blockProps = useBlockProps();

	return (
		<div { ...blockProps }>
			<nav
				className="gateway-pagination"
				aria-label={ __( 'Table pagination', 'gateway' ) }
			>
				<button
					type="button"
					className="gateway-pagination__prev"
					disabled
				>
					{ __( 'Previous', 'gateway' ) }
				</button>
				<span className="gateway-pagination__pages">
					{ [ 1, 2, 3 ].map( ( page ) => (
						<button
							key={ page }
							type="button"
							className={
								1 === page
									? 'gateway-pagination__page is-current'
									: 'gateway-pagination__page'
							}
							disabled
						>
							{ page }
						</button>
					) ) }
				</span>
				<button
					type="button"
					className="gateway-pagination__next"
					disabled
				>
					{ __( 'Next', 'gateway' ) }
				</button>
			</nav>
		</div>
	);
}
