import { memo, useMemo, useState } from '@wordpress/element';
import { useSelect } from '@wordpress/data';
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

/**
 * A card's default starting content on first insert -- Featured Image +
 * Title + Excerpt is the most common "card" shape, and it means the block
 * is never a genuinely empty, confusing box the moment it's added.
 * Nothing stops a user from removing/replacing any of these; this is a
 * starting point, not a restriction (no `allowedBlocks` on this block --
 * any block can go inside, same as core/post-template).
 */
const TEMPLATE = [
	[ 'core/post-featured-image' ],
	[ 'core/post-title' ],
	[ 'core/post-excerpt' ],
];

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
		'gateway/data-cards/postType': postType = 'post',
		'gateway/data-cards/pageSize': pageSize = 12,
	},
} ) {
	const [ activeBlockContextId, setActiveBlockContextId ] = useState();

	const { posts, blocks } = useSelect(
		( select ) => {
			const { getEntityRecords } = select( coreStore );
			const { getBlocks } = select( blockEditorStore );

			return {
				// A page-1-sized preview, same convention as core/post
				// -template's own editor preview -- real pagination is a
				// front-end-only (REST-fetch-driven) concern, see
				// Data_Cards_REST_Controller.
				posts: getEntityRecords( 'postType', postType, {
					per_page: pageSize,
					offset: 0,
				} ),
				blocks: getBlocks( clientId ),
			};
		},
		[ postType, pageSize, clientId ]
	);

	const blockContexts = useMemo(
		() =>
			posts?.map( ( post ) => ( {
				postType: post.type,
				postId: post.id,
			} ) ),
		[ posts ]
	);

	const blockProps = useBlockProps( { className: 'gateway-data-cards-grid' } );

	if ( ! posts ) {
		return (
			<ul { ...blockProps }>
				<li>
					<Spinner />
				</li>
			</ul>
		);
	}

	if ( ! posts.length ) {
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
			{ blockContexts.map( ( blockContext ) => (
				<BlockContextProvider key={ blockContext.postId } value={ blockContext }>
					{ blockContext.postId ===
					( activeBlockContextId || blockContexts[ 0 ]?.postId ) ? (
						<DataCardsBodyInnerBlocks />
					) : null }
					<MemoizedDataCardsBodyPreview
						blocks={ blocks }
						blockContextId={ blockContext.postId }
						setActiveBlockContextId={ setActiveBlockContextId }
						isHidden={
							blockContext.postId ===
							( activeBlockContextId || blockContexts[ 0 ]?.postId )
						}
					/>
				</BlockContextProvider>
			) ) }
		</ul>
	);
}
