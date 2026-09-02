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
	// Injected automatically by the block editor's own layout-support HOC
	// (`withLayoutStyles`, block-editor/src/hooks/layout.js) whenever
	// `supports.layout` is declared -- the real classes/generated CSS that
	// actually turn this block's own `layout: { type: 'grid' }` into a
	// real CSS grid. A block built the ordinary way (a single
	// `useInnerBlocksProps()` call for both wrapper and children) gets
	// this merged in automatically; this block's own synthetic, hand
	// -rolled query-loop wrapper (below, `<ul { ...blockProps }>` around a
	// `.map()`, not `useInnerBlocksProps()`) does NOT, and must merge it
	// in explicitly -- confirmed against `core/post-template/edit.js`'s
	// own real Gutenberg source (`packages/block-library/src/post-template/edit.js`,
	// the exact same synthetic-wrapper shape this block is already ported
	// from), which does the identical merge into its own `useBlockProps()`
	// call. Missing here before now -- reported directly, twice: cards
	// stacked in the editor "even when there is room," while the front
	// end (server-side `get_block_wrapper_attributes()`, which applies
	// layout classes automatically with no equivalent gap) rendered fine.
	__unstableLayoutClassNames,
	context: {
		'gateway/data-cards/sourceType': sourceType = 'postType',
		'gateway/data-cards/postType': postType = 'post',
		'gateway/data-cards/collection': collection = '',
		// 10 -- matching block.json's own attribute default and
		// shared/length-menu.js's own DEFAULT_LENGTH_MENU (its first,
		// smallest option) -- same standard size gateway/datatable's own
		// pageLength attribute already defaults to; only a fallback for a
		// genuinely absent context value, not a second source of truth.
		'gateway/data-cards/pageSize': pageSize = 10,
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

	// Two things leave this card's own authored content pointed at blocks
	// that no longer make sense: switching the parent's Source between
	// Post Type and Collection (Post Title/Featured Image/Excerpt all need
	// a real WP post; gateway/card-field-text needs a Collection record),
	// and -- while already in Collection mode -- switching which
	// Collection is selected (a `fieldKey` valid on the old model may not
	// exist at all on the new one, and a template built for a 3-field
	// model would leave stale extra blocks behind against a model with
	// only 1). Either kind of change queues the same rebuild: back to
	// TEMPLATE's own default shape for Post Type, or a fresh
	// COLLECTION_FIELD_COUNT-block (fewer if the model doesn't have that
	// many) template built from the *current* Collection's own fields.
	// Always a full `replaceInnerBlocks()`, discarding whatever was there
	// before -- a deliberate reset, not a merge, since the whole point is
	// never leaving behind blocks the new selection can't back up.
	//
	// Keyed off refs, not state, specifically so this only ever fires on
	// a REAL, editor-observed change during THIS editing session -- never
	// retroactively just from loading an already-configured instance
	// (both refs' initial values always match the current sourceType/
	// collection, so the "did either actually change" check below is
	// trivially false on mount, and content already saved with a
	// deliberately-authored template is never touched just by opening it).
	const previousSourceTypeRef = useRef( sourceType );
	const previousCollectionRef = useRef( collection );
	const [ isCollectionSwapPending, setIsCollectionSwapPending ] = useState( false );

	useEffect( () => {
		const previousSourceType = previousSourceTypeRef.current;
		const previousCollection = previousCollectionRef.current;
		previousSourceTypeRef.current = sourceType;
		previousCollectionRef.current = collection;

		const sourceTypeChanged = previousSourceType !== sourceType;
		const collectionChanged = previousCollection !== collection;

		if ( ! sourceTypeChanged && ! collectionChanged ) {
			return;
		}

		if ( 'collection' === sourceType ) {
			// Whether this is a fresh switch INTO Collection or a
			// different Collection chosen while already here, either way
			// the template needs rebuilding against whichever fields are
			// actually available now -- deferred to the effect below,
			// which waits for that to resolve.
			setIsCollectionSwapPending( true );
		} else if ( sourceTypeChanged ) {
			// Only restore the Post Type template on an actual mode
			// switch -- `collection` has no bearing once sourceType is
			// back to 'postType', so a lingering change to it (e.g. from
			// before switching away) must never re-trigger this.
			replaceInnerBlocks(
				clientId,
				TEMPLATE.map( ( [ name, attrs ] ) => createBlock( name, attrs || {} ) ),
				false
			);
		}
	}, [ sourceType, collection, clientId, replaceInnerBlocks ] );

	useEffect( () => {
		if ( ! isCollectionSwapPending || ! collection || isLoadingCollectionFields ) {
			return;
		}

		// Always led by the synthetic `id` column (Column_Registry::
		// get_columns_for_collection()), so a Collection with zero of its
		// own user-defined fields still gets at least one -- `id` -- rather
		// than an empty template. Sliced fresh from *this* Collection's
		// own current field list every time, so a rebuild triggered by
		// switching models never carries over more blocks than the new
		// one actually has fields for.
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

	const blockProps = useBlockProps( {
		className: [ 'gateway-data-cards-grid', __unstableLayoutClassNames ]
			.filter( Boolean )
			.join( ' ' ),
	} );

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
