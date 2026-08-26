import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- see gateway/data-cards-search's own
 * edit.js docblock for why: there's no live-instance-to-sync-with
 * equivalent for gateway/data-cards to reach in the editor at all
 * (gateway/data-cards-body's own editor preview is real InnerBlocks +
 * useBlockPreview editing, never a server-rendered grid with real pager
 * state). Representative placeholder numbers only -- the real page count
 * only exists on a real front-end/full-page render (see render.php).
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-data-cards-pagination' } );

	return (
		<nav { ...blockProps } aria-label={ __( 'Grid pagination', 'gateway' ) }>
			<button type="button" className="gateway-data-cards-pagination__prev" disabled>
				{ __( 'Previous', 'gateway' ) }
			</button>
			<span className="gateway-data-cards-pagination__pages">
				{ [ 1, 2, 3 ].map( ( page ) => (
					<button
						key={ page }
						type="button"
						className={
							1 === page
								? 'gateway-data-cards-pagination__page is-current'
								: 'gateway-data-cards-pagination__page'
						}
						disabled
					>
						{ page }
					</button>
				) ) }
			</span>
			<button type="button" className="gateway-data-cards-pagination__next" disabled>
				{ __( 'Next', 'gateway' ) }
			</button>
		</nav>
	);
}
