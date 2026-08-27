import { memo, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { createBlock } from '@wordpress/blocks';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
	BlockContextProvider,
	useBlockProps,
	useInnerBlocksProps,
	__experimentalUseBlockPreview as useBlockPreview,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import { store as coreStore } from '@wordpress/core-data';
import { useAvailableColumns } from '../../shared/use-available-columns';

/**
 * A card's default starting content on first insert -- Featured Image +
 * Title + Excerpt is the most common "card" shape, and it means the block
 * is never a genuinely empty, confusing box the moment it's added.
 * Nothing stops a user from removing/replacing any of these; this is a
 * starting point, not a restriction (no `allowedBlocks` on this block --
 * any block can go inside, same as core/post-template).
 *
 * Also the target this card's own content is swapped BACK to if the
 * parent's Source is switched from Collection back to Post Type -- see
 * the swap effects in Edit() below.
 */
const TEMPLATE = [
	[ 'core/post-featured-image' ],
	[ 'core/post-title' ],
	[ 'core/post-excerpt' ],
];

/**
 * How many of a Collection's own available fields to seed the card
 * template with when Source switches from Post Type to Collection --
 * "the first 3 fields available... 1-2 if 3 aren't", per this behavior's
 * own request.
 */
const COLLECTION_FIELD_COUNT = 3;

// This block's own `supports.layout` (grid) arranges the CARD ITEMS, not
// the blocks *within* one card, which should always stack vertically
// regardless of how the grid itself is laid out -- same override, and
// same reasoning, as core/post-template's own INNER_BLOCKS_LAYOUT
// constant (confirmed by reading packages/block-library/src/post-template/edit.js
// directly): without it, each card's own inner content would inherit and
// re-apply the parent's grid layout classes to itself.
const INNER_BLOCKS_LAYOUT = { type: 'default' };

/**
 * The real, editable template -- rendered for exactly one post (the
 * "active" one) at a time. Every other queried post gets
 * DataCardsBodyPreview below instead.
 */
function DataCardsBodyInnerBlocks() {
	const innerBlocksProps = useInnerBlocksProps(
		{ className: 'gateway-data-cards-grid__item' },
		{
			template: TEMPLATE,
			__unstableDisableLayoutClassNames: true,
			layout: INNER_BLOCKS_LAYOUT,
		}
	);

	return <li { ...innerBlocksProps } />;
}

/**
 * An inert, always-mounted clone of the template, rendered against one
 * specific post's own block context -- exactly one of these (matching
 * whichever post is "active") is hidden via `display: none` rather than
 * unmounted, at any given time, so switching which post is active never
 * has to rebuild a preview from scratch (see core/post-template/edit.js's
 * own docblock for the identical reasoning, quoted in this plugin's own
 * README).
 *
 * @param {Object}   props
 * @param {Object[]} props.blocks                   The template's own live InnerBlocks (getBlocks(clientId)).
 * @param {number}   props.blockContextId            This preview's own post ID.
 * @param {boolean}  props.isHidden                  Whether this is currently the active (real, editable) post.
 * @param {Function} props.setActiveBlockContextId   Makes this preview's post the active one.
 */
function DataCardsBodyPreview( {
	blocks,
	blockContextId,
	isHidden,
	setActiveBlockContextId,
} ) {
	const blockPreviewProps = useBlockPreview( {
		blocks,
		props: { className: 'gateway-data-cards-grid__item' },
	} );

	const handleOnClick = () => {
		setActiveBlockContextId( blockContextId );
	};

	const style = { display: isHidden ? 'none' : undefined };

	return (
		<li
			{ ...blockPreviewProps }
			tabIndex={ 0 }
			// eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
			role="button"
			onClick={ handleOnClick }
			onKeyPress={ handleOnClick }
			style={ style }
		/>
	);
}

const MemoizedDataCardsBodyPreview = memo( DataCardsBodyPreview );

export default function Edit( {
	clientId,
	context: {
		'gateway/data-cards/sourceType': sourceType = 'postType',
		'gateway/data-cards/postType': postType = 'post',
		'gateway/data-cards/collection': collection = '',
		'gateway/data-cards/pageSize': pageSize = 12,
	},
} ) {
	const [ activeBlockContextId, setActiveBlockContextId ] = useState();
	const isCollection = 'collection' === sourceType;

	const { replaceInnerBlocks } = useDispatch( blockEditorStore );

	// The Collection's own fields -- fetched purely to seed the card
	// template's replacement content on a Source switch (see the two
	// effects below), via the same hook/REST route the field-picker
	// blocks already use. `collection: isCollection ? collection : ''`
	// keeps this from ever fetching post-type columns instead (this
	// component has no use for those) -- useAvailableColumns() already
	// skips its fetch entirely when sourceType is 'collection' but
	// `collection` is blank.
	const {
		availableColumns: collectionFields,
		isLoading: isLoadingCollectionFields,
	} = useAvailableColumns( '', {
		sourceType: 'collection',
		collection: isCollection ? collection : '',
	} );

	// Switching the parent's Source between Post Type and Collection
	// leaves this card's own authored content pointed at blocks that make
	// no sense for the new source (Post Title/Featured Image/Excerpt all
	// need a real WP post; gateway/card-field-text needs a Collection
	// record) -- these two effects replace it on that transition: back to
	// TEMPLATE's own default shape for Post Type, or the first
	// COLLECTION_FIELD_COUNT of the newly-chosen Collection's own fields
	// (fewer if it doesn't have that many) for Collection.
	//
	// Keyed off a ref, not state, specifically so this only ever fires on
	// a REAL, editor-observed change of `sourceType` during THIS editing
	// session -- never retroactively just from loading an already
	// -configured instance (the ref's initial value always matches the
	// current `sourceType`, so the "did it actually change" check below
	// is trivially false on mount, and content already saved with a
	// deliberately-authored template is never touched just by opening it).
	const previousSourceTypeRef = useRef( sourceType );
	const [ isCollectionSwapPending, setIsCollectionSwapPending ] = useState( false );

	useEffect( () => {
		const previousSourceType = previousSourceTypeRef.current;
		previousSourceTypeRef.current = sourceType;

		if ( previousSourceType === sourceType ) {
			return;
		}

		if ( 'collection' === sourceType ) {
			// The Collection's own fields may still be loading, or a
			// Collection may not even be chosen yet -- deferred to the
			// effect below, which watches for that to resolve.
			setIsCollectionSwapPending( true );
		} else {
			replaceInnerBlocks(
				clientId,
				TEMPLATE.map( ( [ name, attrs ] ) => createBlock( name, attrs || {} ) ),
				false
			);
		}
	}, [ sourceType, clientId, replaceInnerBlocks ] );

	useEffect( () => {
		if ( ! isCollectionSwapPending || ! collection || isLoadingCollectionFields ) {
			return;
		}

		// Always led by the synthetic `id` column (Column_Registry::
		// get_columns_for_collection()), so a Collection with zero of its
		// own user-defined fields still gets at least one -- `id` -- rather
		// than an empty template.
		const fieldKeys = collectionFields
			.slice( 0, COLLECTION_FIELD_COUNT )
			.map( ( column ) => column.key );

		if ( fieldKeys.length ) {
			replaceInnerBlocks(
				clientId,
				fieldKeys.map( ( fieldKey ) =>
					createBlock( 'gateway/card-field-text', { fieldKey } )
				),
				false
			);
		}

		setIsCollectionSwapPending( false );
	}, [
		isCollectionSwapPending,
		collection,
		isLoadingCollectionFields,
		collectionFields,
		clientId,
		replaceInnerBlocks,
	] );

	const { posts, blocks } = useSelect(
		( select ) => {
			const { getEntityRecords } = select( coreStore );
			const { getBlocks } = select( blockEditorStore );

			return {
				// A page-1-sized preview, same convention as core/post
				// -template's own editor preview -- real pagination is a
				// front-end-only (REST-fetch-driven) concern, see
				// Data_Cards_REST_Controller. Skipped entirely for a
				// Collection source -- core-data has no notion of a
				// Gateway model, that's fetched separately below.
				posts: isCollection
					? null
					: getEntityRecords( 'postType', postType, {
							per_page: pageSize,
							offset: 0,
					  } ),
				blocks: getBlocks( clientId ),
			};
		},
		[ isCollection, postType, pageSize, clientId ]
	);

	// The Collection counterpart of `posts` above -- fetched directly via
	// the same REST route the admin app's own Records screen uses
	// (Records_REST_Controller; gated on manage_options, same as
	// Columns_REST_Controller's own collection route, so this is only
	// ever attempted for someone who could already configure a Collection
	// -sourced block in the first place). Purely a preview aid: the front
	// end's real per-record rendering goes through Data_Cards_Renderer::
	// render_items_for_collection() instead, which never calls this route.
	const [ records, setRecords ] = useState( null );

	useEffect( () => {
		if ( ! isCollection ) {
			setRecords( null );
			return;
		}

		if ( ! collection ) {
			setRecords( [] );
			return;
		}

		let isCurrent = true;
		setRecords( null );

		apiFetch( {
			path: `/gateway/v1/models/${ collection }/records?per_page=${ pageSize }`,
		} )
			.then( ( response ) => {
				if ( isCurrent ) {
					setRecords( response.records || [] );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setRecords( [] );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ isCollection, collection, pageSize ] );

	// Each item's own id (for the click-to-activate/preview-caching
	// mechanism below) plus the actual block context to provide -- 'record'
	// (an unnamespaced context key, matching how core's own 'postId'/
	// 'postType' aren't namespaced either) for a Collection, so
	// gateway/card-field-text and any future field-display block can read
	// `context.record` directly, exactly mirroring the real front-end
	// render_block_context injection in Data_Cards_Renderer::
	// render_items_for_collection().
	const blockContexts = useMemo( () => {
		if ( isCollection ) {
			return ( records || [] ).map( ( record ) => ( {
				id: `record-${ record.id }`,
				context: { record },
			} ) );
		}

		return ( posts || [] ).map( ( post ) => ( {
			id: `post-${ post.id }`,
			context: { postType: post.type, postId: post.id },
		} ) );
	}, [ isCollection, records, posts ] );

	const blockProps = useBlockProps( { className: 'gateway-data-cards-grid' } );

	const items = isCollection ? records : posts;

	if ( ! items ) {
		return (
			<ul { ...blockProps }>
				<li>
					<Spinner />
				</li>
			</ul>
		);
	}

	if ( ! items.length ) {
		return (
			<ul { ...blockProps }>
				<li>{ __( 'No results found.', 'gateway' ) }</li>
			</ul>
		);
	}

	// To avoid flicker when switching active block contexts, a preview is
	// rendered for each block context, but the preview for the active
	// block context is hidden. This ensures that when it is displayed
	// again, the cached rendering of the block preview is used, instead
	// of having to re-render the preview from scratch -- same strategy,
	// and same wording, as core/post-template's own edit.js.
	return (
		<ul { ...blockProps }>
			{ blockContexts.map( ( { id, context: itemContext } ) => (
				<BlockContextProvider key={ id } value={ itemContext }>
					{ id === ( activeBlockContextId || blockContexts[ 0 ]?.id ) ? (
						<DataCardsBodyInnerBlocks />
					) : null }
					<MemoizedDataCardsBodyPreview
						blocks={ blocks }
						blockContextId={ id }
						setActiveBlockContextId={ setActiveBlockContextId }
						isHidden={
							id === ( activeBlockContextId || blockContexts[ 0 ]?.id )
						}
					/>
				</BlockContextProvider>
			) ) }
		</ul>
	);
}
