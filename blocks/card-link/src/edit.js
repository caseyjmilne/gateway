import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { Notice } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Editor UI for the gateway/card-link block -- there's no picker at all
 * (unlike gateway/card-field-text/-number/-image's own Field picker):
 * the Permalink field, if any, is found automatically (`Permalink_Field_Type::
 * max_one_per_model()` guarantees a model has at most one), so this only
 * ever needs to know whether one is actually AVAILABLE, via a new
 * `GET /gateway/v1/models/<class>/permalink` (`Permalink_REST_Controller`)
 * -- `{ available, field, root }` -- fetched once per Collection, same
 * "own small fetch, not shared with useAvailableColumns()" reasoning as
 * every other Collection-scoped concern in this plugin that isn't
 * literally a column list.
 *
 * **The warning.** No Permalink field on this Collection at all, or one
 * with no Root/Template Page configured yet (`available: false`), shows
 * a plain Notice explaining why -- this block would otherwise silently
 * do nothing useful on the front end (render.php's own docblock: no
 * permalink available just prints the inner blocks unwrapped, never an
 * error), which would be a confusing, easy-to-miss surprise without
 * this.
 *
 * **The live preview link.** When a Permalink IS available, InnerBlocks
 * renders inside a real `<a href>` here too -- built from `window.location.origin`
 * (this editor has no equivalent of the admin app's own
 * `window.GatewayAdmin.homeUrl`, and doesn't need one just for this: the
 * editor and the site it's editing always share an origin) plus the
 * fetched `root` plus the current preview record's own slug value
 * (`record[field]`) -- best-effort, same caveat every other field
 * -display block's own docblock in this plugin already states: the
 * REAL link is whatever render.php builds from `Permalink_Routes::
 * url_for_record()` on an actual front-end render, this is only ever a
 * closest-available approximation for while the record context here
 * isn't itself a real front-end request.
 */
export default function Edit( { context } ) {
	const sourceType = context[ 'gateway/data-cards/sourceType' ] || 'postType';
	const collection = context[ 'gateway/data-cards/collection' ] || '';
	const record = context.record;
	const isCollection = 'collection' === sourceType;

	const [ permalink, setPermalink ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( true );

	useEffect( () => {
		if ( ! isCollection || ! collection ) {
			setPermalink( null );
			setIsLoading( false );
			return;
		}

		let isCurrent = true;
		setIsLoading( true );

		apiFetch( { path: `/gateway/v1/models/${ collection }/permalink` } )
			.then( ( result ) => {
				if ( isCurrent ) {
					setPermalink( result );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setPermalink( null );
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoading( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ isCollection, collection ] );

	const isAvailable = Boolean( permalink && permalink.available );

	let previewHref = '';

	if ( isAvailable && record ) {
		const slug = record[ permalink.field ];

		if ( slug ) {
			previewHref = `${ window.location.origin }/${ permalink.root }/${ encodeURIComponent( slug ) }`;
		}
	}

	const blockProps = useBlockProps( { className: 'gateway-card-link' } );
	const innerBlocksProps = useInnerBlocksProps(
		{ ...blockProps, href: previewHref || undefined },
		{ templateLock: false }
	);

	return (
		<>
			{ ! isCollection && (
				<Notice status="warning" isDismissible={ false }>
					{ __(
						'This block only links to a permalink when the Data Cards block’s Source is set to Collection.',
						'gateway'
					) }
				</Notice>
			) }
			{ isCollection && ! collection && (
				<Notice status="info" isDismissible={ false }>
					{ __( 'Choose a Collection on the Data Cards block first.', 'gateway' ) }
				</Notice>
			) }
			{ isCollection && collection && ! isLoading && ! isAvailable && (
				<Notice status="warning" isDismissible={ false }>
					{ __(
						'This Collection has no Permalink available yet -- add a Permalink field to it, and set its Root and Template Page on the Permalinks tab (Gateway › Models). Until then, this block just shows its inner blocks unlinked.',
						'gateway'
					) }
				</Notice>
			) }
			<a { ...innerBlocksProps } />
		</>
	);
}
