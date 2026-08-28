import { memo, useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { useDispatch, useSelect } from '@wordpress/data';
import { createBlock } from '@wordpress/blocks';
import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import {
	BlockContextProvider,
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
	__experimentalUseBlockPreview as useBlockPreview,
	store as blockEditorStore,
} from '@wordpress/block-editor';
import { Notice, PanelBody, RangeControl, SelectControl, Spinner } from '@wordpress/components';
import { useAvailableColumns } from '../../shared/use-available-columns';
import { useLoopableRelationships } from '../../shared/use-loopable-relationships';

/**
 * How many of the related model's own fields to seed this block's
 * template with the first time a relationship is chosen (or changed to a
 * different one) -- same idea, and same count, as gateway/data-cards-body's
 * own COLLECTION_FIELD_COUNT.
 */
const RELATED_FIELD_COUNT = 3;

const RELATIONSHIP_TYPE_LABELS = {
	hasMany: __( 'Has Many', 'gateway' ),
	belongsToMany: __( 'Belongs To Many', 'gateway' ),
};

// This block's own per-item template should always stack vertically,
// regardless of any layout support this block itself might gain later --
// same override, same reasoning, as gateway/data-cards-body's own
// INNER_BLOCKS_LAYOUT constant.
const INNER_BLOCKS_LAYOUT = { type: 'default' };

/**
 * The real, editable template -- rendered for exactly one related record
 * (the "active" one) at a time. Every other fetched related record gets
 * RelatedItemsPreview below instead. Structurally identical to
 * gateway/data-cards-body's own DataCardsBodyInnerBlocks -- see that
 * block's own edit.js for the full reasoning this mirrors.
 */
function RelatedItemsInnerBlocks() {
	const innerBlocksProps = useInnerBlocksProps(
		{ className: 'gateway-related-items__item' },
		{ __unstableDisableLayoutClassNames: true, layout: INNER_BLOCKS_LAYOUT }
	);

	return <li { ...innerBlocksProps } />;
}

/**
 * An inert, always-mounted clone of the template, rendered against one
 * specific related record's own block context -- exactly one of these
 * (matching whichever related record is "active") is hidden via
 * `display: none` rather than unmounted, at any given time, so switching
 * which one is active never has to rebuild a preview from scratch. Same
 * mechanism as gateway/data-cards-body's own DataCardsBodyPreview.
 */
function RelatedItemsPreview( {
	blocks,
	blockContextId,
	isHidden,
	setActiveBlockContextId,
} ) {
	const blockPreviewProps = useBlockPreview( {
		blocks,
		props: { className: 'gateway-related-items__item' },
	} );

	const handleOnClick = () => {
		setActiveBlockContextId( blockContextId );
	};

	return (
		<li
			{ ...blockPreviewProps }
			tabIndex={ 0 }
			// eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
			role="button"
			onClick={ handleOnClick }
			onKeyPress={ handleOnClick }
			style={ { display: isHidden ? 'none' : undefined } }
		/>
	);
}

const MemoizedRelatedItemsPreview = memo( RelatedItemsPreview );

/**
 * @param {Object} relationship {method_name, type, related_model}.
 */
function relationshipOptionLabel( relationship ) {
	const typeLabel = RELATIONSHIP_TYPE_LABELS[ relationship.type ] || relationship.type;
	return `${ relationship.related_model } -- ${ relationship.method_name }() (${ typeLabel })`;
}

export default function Edit( {
	clientId,
	attributes: { relationshipMethod, relatedCollection, limit },
	setAttributes,
	context: { 'gateway/data-cards/collection': collection = '', record },
} ) {
	const [ activeBlockContextId, setActiveBlockContextId ] = useState();
	const { replaceInnerBlocks } = useDispatch( blockEditorStore );

	// This block's OWN setting -- unlike gateway/data-cards-body (whose
	// settings all live on the parent gateway/data-cards), there's no
	// natural "parent" to configure a relationship/limit on here, so this
	// block has its own Inspector.
	const { relationships, isLoading: isLoadingRelationships } = useLoopableRelationships( collection );

	const selectedRelationship = relationships.find(
		( relationship ) => relationship.method_name === relationshipMethod
	);
	const isStaleRelationship =
		Boolean( relationshipMethod ) && ! isLoadingRelationships && ! selectedRelationship;

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
	// model -- mirrors gateway/data-cards-body's own field-seeding on a
	// Collection switch, just one level deeper (the RELATED model's own
	// fields, not the parent's).
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

	// A real, page-1-sized sample of related records for whichever record
	// is currently active in the PARENT gateway/data-cards-body preview
	// (context.record -- the outer, e.g. Event, record; shadowed by our
	// own BlockContextProvider below only for THIS block's own
	// descendants). Purely a preview aid, same convention as every other
	// Collection-aware block's own editor preview in this plugin -- the
	// real front end (render.php) reads a record's own related items
	// directly, with no REST round trip.
	const [ relatedRecords, setRelatedRecords ] = useState( null );

	useEffect( () => {
		if ( ! collection || ! record || ! relationshipMethod || isStaleRelationship ) {
			setRelatedRecords( [] );
			return;
		}

		let isCurrent = true;
		setRelatedRecords( null );

		apiFetch( {
			path: `/gateway/v1/models/${ collection }/records/${ record.id }/relationships/${ relationshipMethod }`,
		} )
			.then( ( response ) => {
				if ( isCurrent ) {
					setRelatedRecords( response.records || [] );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setRelatedRecords( [] );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ collection, record, relationshipMethod, isStaleRelationship ] );

	const blocks = useSelect(
		( select ) => select( blockEditorStore ).getBlocks( clientId ),
		[ clientId ]
	);

	const blockContexts = useMemo(
		() =>
			( relatedRecords || [] ).map( ( relatedRecord ) => ( {
				id: `related-${ relatedRecord.id }`,
				context: { record: relatedRecord },
			} ) ),
		[ relatedRecords ]
	);

	const blockProps = useBlockProps( { className: 'gateway-related-items' } );

	const inspectorControls = (
		<InspectorControls>
			<PanelBody title={ __( 'Related Items Settings', 'gateway' ) }>
				{ ! collection && (
					<Notice status="info" isDismissible={ false }>
						{ __(
							'Choose a Collection on the Data Cards block first.',
							'gateway'
						) }
					</Notice>
				) }
				{ collection &&
					! isLoadingRelationships &&
					relationships.length === 0 && (
						<Notice status="warning" isDismissible={ false }>
							{ __(
								'This model has no "Has Many"/"Belongs To Many" relationships yet -- add one in its Relationships section first.',
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
								label: relationshipOptionLabel( relationship ),
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
				<RangeControl
					label={ __( 'Limit', 'gateway' ) }
					help={ __(
						'Maximum related records to show. 0 shows every one.',
						'gateway'
					) }
					min={ 0 }
					max={ 50 }
					value={ limit }
					onChange={ ( value ) => setAttributes( { limit: value ?? 0 } ) }
				/>
			</PanelBody>
		</InspectorControls>
	);

	if ( ! relationshipMethod || isStaleRelationship ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-related-items__placeholder">
						{ __(
							'Choose a relationship in the Inspector to loop over its related records.',
							'gateway'
						) }
					</p>
				</div>
			</>
		);
	}

	if ( ! record ) {
		// No active parent record in context (e.g. this Collection
		// currently has zero records at all) -- still lets the per-item
		// template be designed, just with no live record to preview
		// against, the same "still editable even with nothing real to
		// preview" fallback gateway/card-field-text's own preview text
		// already uses.
		return (
			<>
				{ inspectorControls }
				<ul { ...blockProps }>
					<RelatedItemsInnerBlocks />
				</ul>
			</>
		);
	}

	if ( null === relatedRecords ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<Spinner />
				</div>
			</>
		);
	}

	if ( 0 === relatedRecords.length ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-related-items__empty">
						{ __( 'No related records yet.', 'gateway' ) }
					</p>
				</div>
			</>
		);
	}

	// To avoid flicker when switching active block contexts, a preview is
	// rendered for each block context, but the preview for the active
	// block context is hidden -- same strategy, and same wording, as
	// gateway/data-cards-body's own edit.js.
	return (
		<>
			{ inspectorControls }
			<ul { ...blockProps }>
				{ blockContexts.map( ( { id, context: itemContext } ) => (
					<BlockContextProvider key={ id } value={ itemContext }>
						{ id === ( activeBlockContextId || blockContexts[ 0 ]?.id ) ? (
							<RelatedItemsInnerBlocks />
						) : null }
						<MemoizedRelatedItemsPreview
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
		</>
	);
}
