import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { useDispatch } from '@wordpress/data';
import { createBlock } from '@wordpress/blocks';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
	BlockContextProvider,
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Notice, PanelBody, SelectControl, Spinner } from '@wordpress/components';
import CollectionControl from '../../shared/controls/collection-control';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useLoopableRelationships } from '../../shared/use-loopable-relationships';

/**
 * How many parent groups (and, independently, how many children per
 * group) the editor's own preview fetches -- a "page-1-sized preview,"
 * same convention as every other Collection-aware block's own editor
 * preview in this plugin, not a hard limit on the real front end (which
 * always renders every group/child -- see render.php's own docblock).
 */
const PREVIEW_GROUP_COUNT = 10;
const PREVIEW_CHILD_COUNT = 10;

/**
 * How many of the related model's own fields to seed this block's
 * template with the first time a relationship is chosen (or changed to
 * a different one) -- same idea, and same count, as gateway/data-cards-body's
 * own COLLECTION_FIELD_COUNT.
 */
const RELATED_FIELD_COUNT = 3;

// Only hasMany is offered here -- a belongsToMany child has no single
// "owning" parent to sit under, which this block's one-parent-per-child
// sidebar shape has no way to represent (see render.php's own docblock).
const LOOPABLE_TYPES = [ 'hasMany' ];

// This block's own per-child detail template should always stack
// vertically -- same override, same reasoning, as gateway/data-cards-body's
// own INNER_BLOCKS_LAYOUT constant.
const INNER_BLOCKS_LAYOUT = { type: 'default' };

/**
 * The real, editable template -- rendered for exactly one child record at
 * a time: whichever one is active on the sidebar (or the first child, when
 * none has been picked yet). Deliberately the ONLY thing ever mounted in
 * the main pane -- no inert clones of the other children sit alongside it
 * (unlike gateway/data-cards-body's own grid, which must show every card
 * at once and so keeps one memoized preview per card around to avoid
 * rebuilding on every switch). This block's own real front end
 * (render.php) only ever shows one child's markup at a time too (every
 * other panel carries the `hidden` attribute) -- mirroring that exactly
 * means the editor has no reason to keep anything else mounted, and
 * switching the active child is simply re-rendering this same template
 * against a new block context, same as any other Collection-aware field
 * block re-rendering when its own context changes.
 */
function DataDisplayInnerBlocks() {
	const innerBlocksProps = useInnerBlocksProps(
		{ className: 'gateway-data-display__panel' },
		{ __unstableDisableLayoutClassNames: true, layout: INNER_BLOCKS_LAYOUT }
	);

	return <li { ...innerBlocksProps } />;
}

export default function Edit( { attributes, setAttributes, clientId } ) {
	const { collection, relationshipMethod, relatedCollection } = attributes;

	const [ activeChildId, setActiveChildId ] = useState( null );
	const { replaceInnerBlocks } = useDispatch( blockEditorStore );

	const { relationships, isLoading: isLoadingRelationships } = useLoopableRelationships(
		collection,
		LOOPABLE_TYPES
	);

	const selectedRelationship = relationships.find(
		( relationship ) => relationship.method_name === relationshipMethod
	);
	const isStaleRelationship =
		Boolean( relationshipMethod ) && ! isLoadingRelationships && ! selectedRelationship;

	// Switching Collection invalidates whatever relationship/related
	// model was chosen for the PREVIOUS one -- same "a change upstream
	// resets what depended on it" reasoning gateway/data-cards-body's own
	// Source/Collection-switch effect documents. Keyed off a ref, not
	// state, so this only fires on a real, editor-observed change during
	// THIS session -- never retroactively just from loading an
	// already-configured instance.
	const previousCollectionRef = useRef( collection );

	useEffect( () => {
		if ( previousCollectionRef.current === collection ) {
			return;
		}

		previousCollectionRef.current = collection;
		setAttributes( { relationshipMethod: '', relatedCollection: '' } );
	}, [ collection, setAttributes ] );

	const handleRelationshipChange = ( methodName ) => {
		const relationship = relationships.find(
			( candidate ) => candidate.method_name === methodName
		);

		setAttributes( {
			relationshipMethod: methodName,
			relatedCollection: relationship ? relationship.related_model : '',
		} );
	};

	// Auto-seed a starting template the first time a relationship is
	// chosen, or whenever it's changed to one pointing at a different
	// model -- mirrors gateway/data-cards-body's own field-seeding, and
	// gateway/related-items' own identical mechanism.
	const {
		availableColumns: relatedFields,
		isLoading: isLoadingRelatedFields,
	} = useAvailableColumns( '', {
		sourceType: 'collection',
		collection: relatedCollection,
	} );

	const previousRelatedCollectionRef = useRef( relatedCollection );
	const [ isSeedPending, setIsSeedPending ] = useState( false );

	useEffect( () => {
		if ( previousRelatedCollectionRef.current === relatedCollection ) {
			return;
		}

		previousRelatedCollectionRef.current = relatedCollection;

		if ( relatedCollection ) {
			setIsSeedPending( true );
		}
	}, [ relatedCollection ] );

	useEffect( () => {
		if ( ! isSeedPending || isLoadingRelatedFields ) {
			return;
		}

		const fieldKeys = relatedFields
			.slice( 0, RELATED_FIELD_COUNT )
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

		setIsSeedPending( false );
	}, [
		isSeedPending,
		isLoadingRelatedFields,
		relatedFields,
		clientId,
		replaceInnerBlocks,
	] );

	// The editor's own preview: real parent groups, each with a real
	// sample of its own children -- fetched the same way gateway/related-items'
	// own editor preview is, just once per shown parent instead of once
	// for a single record. Purely a preview aid; the real front end
	// (render.php) queries directly, with no REST round trip and no cap
	// on how many groups/children it shows.
	const [ groups, setGroups ] = useState( null );

	useEffect( () => {
		if ( ! collection || ! relationshipMethod || isStaleRelationship ) {
			setGroups( [] );
			return;
		}

		let isCurrent = true;
		setGroups( null );

		apiFetch( {
			path: `/gateway/v1/models/${ collection }/records?per_page=${ PREVIEW_GROUP_COUNT }`,
		} )
			.then( ( response ) => {
				const parents = response.records || [];

				return Promise.all(
					parents.map( ( parent ) =>
						apiFetch( {
							path: `/gateway/v1/models/${ collection }/records/${ parent.id }/relationships/${ relationshipMethod }?per_page=${ PREVIEW_CHILD_COUNT }`,
						} )
							.then( ( childResponse ) => ( {
								parent,
								children: childResponse.records || [],
							} ) )
							.catch( () => ( { parent, children: [] } ) )
					)
				);
			} )
			.then( ( built ) => {
				if ( isCurrent ) {
					setGroups( built );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setGroups( [] );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ collection, relationshipMethod, isStaleRelationship ] );

	// Every child, across every group, flattened -- what actually drives
	// which one is active below. A group heading itself is never "active"
	// -- only a child ever loads into the single, shared detail template.
	const allChildren = useMemo(
		() => ( groups || [] ).flatMap( ( group ) => group.children ),
		[ groups ]
	);

	const effectiveActiveChildId =
		activeChildId ?? ( allChildren[ 0 ] ? allChildren[ 0 ].id : null );

	// The one child actually rendered into the main pane -- whichever is
	// active on the sidebar, falling back to the first child (matching
	// render.php's own identical fallback: its `$first_child_id` is what
	// starts without the `hidden` attribute). `?? allChildren[0]` covers
	// the moment `effectiveActiveChildId` still names a child from a since
	// -changed relationship/collection that this fresh `allChildren` no
	// longer contains.
	const activeChild =
		allChildren.find( ( child ) => child.id === effectiveActiveChildId ) ??
		allChildren[ 0 ] ??
		null;

	const blockProps = useBlockProps( { className: 'gateway-data-display' } );

	const inspectorControls = (
		<InspectorControls>
			<PanelBody title={ __( 'Data Display Settings', 'gateway' ) }>
				<CollectionControl
					value={ collection }
					onChange={ ( value ) => setAttributes( { collection: value } ) }
				/>
				{ collection &&
					! isLoadingRelationships &&
					relationships.length === 0 && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This model has no "Has Many" relationships yet -- add one in its Relationships section first.',
								'gateway'
							) }
						</Notice>
					) }
				{ collection && relationships.length > 0 && (
					<SelectControl
						label={ __( 'Relationship', 'gateway' ) }
						value={ relationshipMethod }
						options={ [
							{
								label: __( '— Select a relationship —', 'gateway' ),
								value: '',
							},
							...relationships.map( ( relationship ) => ( {
								label: `${ relationship.related_model } (${ relationship.method_name }())`,
								value: relationship.method_name,
							} ) ),
						] }
						disabled={ isLoadingRelationships }
						onChange={ handleRelationshipChange }
					/>
				) }
				{ isStaleRelationship && (
					<Notice status="warning" isDismissible={ false }>
						{ __(
							'This relationship no longer exists. Choose another.',
							'gateway'
						) }
					</Notice>
				) }
			</PanelBody>
		</InspectorControls>
	);

	if ( ! collection ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-data-display__placeholder">
						{ __(
							'Choose a Collection in the Inspector to get started.',
							'gateway'
						) }
					</p>
				</div>
			</>
		);
	}

	if ( ! relationshipMethod || isStaleRelationship ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-data-display__placeholder">
						{ __(
							'Choose a "Has Many" relationship in the Inspector -- e.g. "Doc Groups" and its own "Docs" -- to build the sidebar from.',
							'gateway'
						) }
					</p>
				</div>
			</>
		);
	}

	if ( null === groups ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<Spinner />
				</div>
			</>
		);
	}

	return (
		<>
			{ inspectorControls }
			<div { ...blockProps }>
				<nav className="gateway-data-display__sidebar">
					{ 0 === groups.length ? (
						<p className="gateway-data-display__empty">
							{ __( 'No records yet.', 'gateway' ) }
						</p>
					) : (
						<ul className="gateway-data-display__groups">
							{ groups.map( ( { parent, children } ) => (
								<li className="gateway-data-display__group" key={ parent.id }>
									<div className="gateway-data-display__group-heading">
										{ parent.label ?? `#${ parent.id }` }
									</div>
									{ children.length > 0 && (
										<ul className="gateway-data-display__children">
											{ children.map( ( child ) => (
												<li key={ child.id }>
													<button
														type="button"
														className={
															'gateway-data-display__child-link' +
															( child.id === effectiveActiveChildId
																? ' is-active'
																: '' )
														}
														onClick={ () =>
															setActiveChildId( child.id )
														}
													>
														{ child.label ?? `#${ child.id }` }
													</button>
												</li>
											) ) }
										</ul>
									) }
								</li>
							) ) }
						</ul>
					) }
				</nav>
				<div className="gateway-data-display__main">
					{ 0 === allChildren.length ? (
						// Mirrors render.php's own `! $has_any_children` branch --
						// there's no record this template could possibly render
						// against, so this is a real error state, not a quiet
						// placeholder.
						<Notice status="error" isDismissible={ false }>
							{ __(
								'No related records found. Add at least one before this template can render.',
								'gateway'
							) }
						</Notice>
					) : (
						<ul className="gateway-data-display__panels">
							<BlockContextProvider
								// Only the active child is ever mounted -- see
								// DataDisplayInnerBlocks' own docblock for why no
								// inert clones of the others sit alongside it.
								// `record` is the one piece this genuinely nested
								// InnerBlocks instance couldn't otherwise get --
								// it's dynamic, so there's no static
								// `providesContext` entry for it (mirrors
								// Data_Cards_Renderer::render_items_for_collection()'s
								// own `render_block_context` filter on the front
								// end). `gateway/data-cards/sourceType`/
								// `gateway/data-cards/collection` are already
								// inherited from this block's own real
								// `providesContext` (declared in block.json) since
								// this is a real, still-nested block -- named here
								// too only to spell out the full context contract
								// a nested field block can rely on.
								key={ activeChild.id }
								value={ {
									record: activeChild,
									'gateway/data-cards/sourceType': 'collection',
									'gateway/data-cards/collection': relatedCollection,
								} }
							>
								<DataDisplayInnerBlocks />
							</BlockContextProvider>
						</ul>
					) }
				</div>
			</div>
		</>
	);
}
