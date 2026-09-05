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

const ORDER_OPTIONS = [
	{ label: __( 'Ascending', 'gateway' ), value: 'asc' },
	{ label: __( 'Descending', 'gateway' ), value: 'desc' },
];

/**
 * `Column_Registry::get_columns_for_collection()`'s own `isOrderable`
 * (`Field_Type::is_orderable()`) is what narrows a collection's own
 * fields down to the ones this block's Order By pickers should even
 * offer -- the synthetic `id` column included (always `isOrderable`),
 * every other field only when its own type is (see that interface
 * method's own docblock for exactly which built-in types that excludes
 * and why: Password, both Relate types, and every array-valued type
 * like Checkbox/Post Object/User).
 *
 * @param {Object[]} fields `useAvailableColumns()`'s own returned list.
 * @return {{label: string, value: string}[]}
 */
function buildOrderByOptions( fields ) {
	return fields
		.filter( ( field ) => field.isOrderable )
		.map( ( field ) => ( { label: field.label, value: field.key } ) );
}

/**
 * A permissive, best-effort comparator for the editor's OWN preview
 * only -- the real front end (render.php) always runs the authoritative
 * SQL `ORDER BY` (`Model_Fields::resolve_orderby()`); this just needs
 * the preview to usually look right for whatever page-1-sized sample is
 * already fetched, the same "not exhaustively correct for every locale/
 * collation edge case" trade-off RecordsCrud.jsx's own identically
 * -reasoned `compareForInstantSort()` already accepts for its own
 * client-side instant resort.
 */
function comparePreviewValues( a, b ) {
	if ( 'number' === typeof a && 'number' === typeof b ) {
		return a - b;
	}

	return String( a ?? '' ).localeCompare( String( b ?? '' ), undefined, {
		numeric: true,
		sensitivity: 'base',
	} );
}

/**
 * Sorts a copy of `items` by `orderBy` (falling back to `id`, matching
 * `Model_Fields::resolve_orderby()`'s own default) and `order`
 * ('asc'/'desc') -- `getValue` lets a caller pull the value to compare
 * from somewhere other than `item[orderBy]` directly (the parent groups
 * below are `{parent, children}` wrapper objects, not raw records).
 *
 * @param {Object[]} items
 * @param {string}   orderBy
 * @param {string}   order
 * @param {Function} [getValue]
 * @return {Object[]} A new, sorted array -- `items` itself is untouched.
 */
function sortForPreview( items, orderBy, order, getValue ) {
	const key          = orderBy || 'id';
	const resolveValue = getValue || ( ( item ) => item[ key ] );
	const sorted       = [ ...items ].sort( ( a, b ) =>
		comparePreviewValues( resolveValue( a ), resolveValue( b ) )
	);

	return 'desc' === order ? sorted.reverse() : sorted;
}

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
	const {
		collection,
		relationshipMethod,
		relatedCollection,
		parentOrderBy,
		parentOrder,
		childOrderBy,
		childOrder,
	} = attributes;

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

	// The Parent Order By picker's own field list -- collection's own
	// fields, the same shape (and the same `isOrderable` flag) the
	// EXISTING relatedFields fetch just below already gets for the Child
	// Order By picker, just against `collection` instead of
	// `relatedCollection`.
	const { availableColumns: parentFields, isLoading: isLoadingParentFields } = useAvailableColumns( '', {
		sourceType: 'collection',
		collection,
	} );

	// Auto-seed a starting template the first time a relationship is
	// chosen, or whenever it's changed to one pointing at a different
	// model -- mirrors gateway/data-cards-body's own field-seeding, and
	// gateway/related-items' own identical mechanism, wrapped in a
	// two-column layout alongside one gateway/data-display-prev-next and
	// one gateway/data-display-toc (see the effect below).
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

		// gateway/data-display-prev-next and gateway/data-display-toc
		// both always get seeded, even with zero eligible text fields --
		// each is independently useful on its own, and both are pieces
		// of this starting template a site owner would otherwise have to
		// remember to add by hand every single time (unlike the field
		// blocks below, which just show whatever fields happen to exist
		// -- there's no equivalent "site owner already knows this
		// exists" fallback for either).
		//
		// A real, fully-editable native core/columns -> two core/column
		// layout, not anything this block renders itself -- the seeded
		// field blocks + Previous/Next in the first (wider) column, the
		// Table of Contents alone in the second -- giving a site owner
		// the SAME resize/rearrange/remove controls they'd have over any
		// other Columns block on the page, rather than a fixed layout
		// baked into this block's own render.php. `isStackedOnMobile:
		// false` deliberately turns off core/columns' own default
		// viewport-media-query stacking -- gateway/data-display-toc's
		// own style.scss instead hides its entire column outright via a
		// CONTAINER query (this row's own actual rendered width, not the
		// browser viewport) once there's genuinely no room for it, which
		// is a meaningfully different, more correct condition than "the
		// window is narrow" for a block that can end up embedded
		// anywhere. Both columns' own `className` exist specifically to
		// give that stylesheet stable selectors to hang the container
		// -query relationship off of -- see that file's own docblock.
		replaceInnerBlocks(
			clientId,
			[
				createBlock(
					'core/columns',
					{
						isStackedOnMobile: false,
						className: 'gateway-data-display-layout',
					},
					[
						createBlock(
							'core/column',
							{
								width: '75%',
								className: 'gateway-data-display-content-column',
							},
							[
								...fieldKeys.map( ( fieldKey ) =>
									createBlock( 'gateway/card-field-text', { fieldKey } )
								),
								createBlock( 'gateway/data-display-prev-next' ),
							]
						),
						createBlock(
							'core/column',
							{
								width: '25%',
								className: 'gateway-data-display-toc-column',
							},
							[ createBlock( 'gateway/data-display-toc' ) ]
						),
					]
				),
			],
			false
		);

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
	//
	// Fetched RAW, un-ordered by either parentOrderBy/childOrderBy --
	// the REST endpoints this hits (GET /records, GET .../relationships/
	// {method}) are the general-purpose ones RecordsCrud.jsx's own table
	// also uses, whose own `orderby` support is gated by that SEPARATE,
	// admin-opted-in Model_Columns "Sortable" config (see resolve_sort()'s
	// own docblock) -- not the same, type-declared `is_orderable()` this
	// block's own pickers are built on. Re-sorting the already-fetched
	// sample CLIENT-SIDE below (`groups`, derived from this) sidesteps
	// that mismatch entirely: the preview always reflects exactly what
	// was actually picked, with no dependency on whether this model's
	// Columns tab happens to also mark the same field sortable.
	const [ rawGroups, setRawGroups ] = useState( null );

	useEffect( () => {
		if ( ! collection || ! relationshipMethod || isStaleRelationship ) {
			setRawGroups( [] );
			return;
		}

		let isCurrent = true;
		setRawGroups( null );

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
					setRawGroups( built );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setRawGroups( [] );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ collection, relationshipMethod, isStaleRelationship ] );

	// The actual preview: rawGroups, re-sorted client-side by whichever
	// Order By/Order the Inspector currently has set -- see rawGroups'
	// own docblock above for why this can't simply be REST `orderby`
	// params on the fetch itself. Groups (parents) are sorted by
	// parentOrderBy/parentOrder; each group's own children by
	// childOrderBy/childOrder -- exactly mirroring render.php's own two
	// independent orderBy() calls.
	const groups = useMemo( () => {
		if ( ! rawGroups ) {
			return rawGroups;
		}

		return sortForPreview(
			rawGroups,
			parentOrderBy,
			parentOrder,
			( group ) => group.parent[ parentOrderBy || 'id' ]
		).map( ( group ) => ( {
			...group,
			children: sortForPreview( group.children, childOrderBy, childOrder ),
		} ) );
	}, [ rawGroups, parentOrderBy, parentOrder, childOrderBy, childOrder ] );

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
			{ collection && (
				<PanelBody title={ __( 'Parent Order', 'gateway' ) } initialOpen={ false }>
					<SelectControl
						label={ __( 'Order By', 'gateway' ) }
						value={ parentOrderBy }
						options={ buildOrderByOptions( parentFields ) }
						disabled={ isLoadingParentFields }
						onChange={ ( value ) =>
							setAttributes( { parentOrderBy: value } )
						}
					/>
					<SelectControl
						label={ __( 'Order', 'gateway' ) }
						value={ parentOrder }
						options={ ORDER_OPTIONS }
						onChange={ ( value ) =>
							setAttributes( { parentOrder: value } )
						}
					/>
				</PanelBody>
			) }
			{ relatedCollection && (
				<PanelBody title={ __( 'Child Order', 'gateway' ) } initialOpen={ false }>
					<SelectControl
						label={ __( 'Order By', 'gateway' ) }
						value={ childOrderBy }
						options={ buildOrderByOptions( relatedFields ) }
						disabled={ isLoadingRelatedFields }
						onChange={ ( value ) =>
							setAttributes( { childOrderBy: value } )
						}
					/>
					<SelectControl
						label={ __( 'Order', 'gateway' ) }
						value={ childOrder }
						options={ ORDER_OPTIONS }
						onChange={ ( value ) =>
							setAttributes( { childOrder: value } )
						}
					/>
				</PanelBody>
			) }
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
