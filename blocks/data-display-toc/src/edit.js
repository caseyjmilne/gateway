import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import { PanelBody, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Representative placeholder entries only -- same reasoning as
 * gateway/data-display-prev-next's own edit.js: there's no real
 * "headings that will actually end up in the active child's own
 * content" to reach for in the editor (that's a front-end-only,
 * scan-the-fully-rendered-DOM fact -- see render.php's own docblock).
 * Two levels deep, matching the kind of nesting `view.js`'s own
 * buildList() actually produces from a real H2/H3 mix.
 */
const PLACEHOLDER_ITEMS = [
	{ label: __( 'Overview', 'gateway' ), children: [] },
	{
		label: __( 'Getting Started', 'gateway' ),
		children: [ __( 'Installation', 'gateway' ), __( 'Configuration', 'gateway' ) ],
	},
	{ label: __( 'Next Steps', 'gateway' ), children: [] },
];

export default function Edit( { attributes, setAttributes } ) {
	const { heading } = attributes;
	const blockProps = useBlockProps( { className: 'gateway-data-display-toc' } );

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'Table of Contents Settings', 'gateway' ) }>
					<TextControl
						label={ __( 'Heading', 'gateway' ) }
						value={ heading }
						onChange={ ( value ) => setAttributes( { heading: value } ) }
					/>
				</PanelBody>
			</InspectorControls>
			<nav { ...blockProps } aria-label={ heading }>
				<p className="gateway-data-display-toc__heading">{ heading }</p>
				<div className="gateway-data-display-toc__list">
					<ul>
						{ PLACEHOLDER_ITEMS.map( ( item ) => (
							<li key={ item.label }>
								<a href="#">{ item.label }</a>
								{ item.children.length > 0 && (
									<ul>
										{ item.children.map( ( child ) => (
											<li key={ child }>
												<a href="#">{ child }</a>
											</li>
										) ) }
									</ul>
								) }
							</li>
						) ) }
					</ul>
				</div>
			</nav>
		</>
	);
}
