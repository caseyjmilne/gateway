import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * A static, non-functional preview -- same reasoning as
 * gateway/data-cards-pagination's own edit.js: there's no "which child
 * is currently active" concept to reach for in the editor at all, since
 * that's entirely a front-end, `window.location.hash`-driven runtime
 * fact (see render.php's own docblock). Representative placeholder
 * labels only, both always shown -- the editor has no notion of "this
 * would actually be the first/last item" either.
 */
export default function Edit() {
	const blockProps = useBlockProps( {
		className: 'gateway-data-display-prev-next',
	} );

	return (
		<nav { ...blockProps } aria-label={ __( 'Previous / Next', 'gateway' ) }>
			<span className="gateway-data-display-prev-next__link gateway-data-display-prev-next__link--prev">
				<span className="gateway-data-display-prev-next__direction">
					{ __( '← Previous', 'gateway' ) }
				</span>
				<span className="gateway-data-display-prev-next__title">
					{ __( 'Previous item title', 'gateway' ) }
				</span>
			</span>
			<span className="gateway-data-display-prev-next__link gateway-data-display-prev-next__link--next">
				<span className="gateway-data-display-prev-next__direction">
					{ __( 'Next →', 'gateway' ) }
				</span>
				<span className="gateway-data-display-prev-next__title">
					{ __( 'Next item title', 'gateway' ) }
				</span>
			</span>
		</nav>
	);
}
