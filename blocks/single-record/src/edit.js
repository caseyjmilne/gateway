import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import {
	BlockContextProvider,
	InspectorControls,
	useBlockProps,
	useInnerBlocksProps,
} from '@wordpress/block-editor';
import { ComboboxControl, Notice, PanelBody, Spinner } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import CollectionControl from '../../shared/controls/collection-control';

/**
 * Editor UI for the gateway/single-record block. A real, live preview
 * record now feeds the InnerBlocks area via block context (`record`),
 * the same unnamespaced key gateway/data-cards-body's own edit.js
 * already provides for its per-item previews -- so gateway/card-field
 * -text/-number/-image and gateway/related-items all show real data
 * while designing the template here too, not just on the front end.
 * (An earlier version of this file deliberately skipped this, reasoning
 * that no single record here is more "correct" to preview than any
 * other -- since revised: a real, changeable preview is more useful
 * than none, provided the person designing the template can see, and
 * change, which record they're looking at -- see `previewRecordId`
 * below.)
 *
 * **Default record** -- `GET .../records/search` with no `q` (the same
 * route RelateAutocomplete.jsx already uses for a Relate to One/Many
 * field's own search-as-you-type, here reused purely for its "no query
 * -> the model's own most-recent records, id desc, capped at
 * Records_REST_Controller::SEARCH_LIMIT" behavior) doubles as both this
 * Combobox's own default option list AND, absent a deliberately chosen
 * `previewRecordId`, the source of "the first record it can find": its
 * own first result. Cheap and already-built, rather than a second route
 * -- this never needs more than a `{id, label}` pair to know WHICH
 * record is first; the full record itself is fetched separately, below.
 *
 * **A chosen `previewRecordId`** is looked up directly via
 * `GET .../records/<id>` regardless of whether it's still one of the
 * search route's own most-recent results (a deliberately-searched-for
 * OLDER record, picked specifically because it isn't one of those,
 * would otherwise never resolve) -- and if that lookup 404s (the record
 * was since deleted), the attribute is cleared back to `0` so this
 * falls back to "the first record it can find" again automatically,
 * rather than leaving the template stuck on a permanent error.
 *
 * **No records at all** in the chosen Collection shows a plain Notice
 * instead of a preview -- InnerBlocks stays fully editable regardless
 * (this is exactly the "record context absent" case gateway/card-field
 * -text's own docblock already treats as a normal, handled state, not
 * an error), a site owner can still design the template, they simply
 * won't see it filled in with real data until at least one record
 * exists.
 *
 * A real visitor arriving via a genuine `/{root}/{slug}` URL always
 * resolves their own record from THAT slug, via
 * Permalink_Routes::inject_record_context(), completely independent of
 * whichever record happened to be selected here last -- `previewRecordId`
 * plays no part in that path at all. A direct visit to the Template
 * Page's OWN url (no slug in it at all) is different: there's no real
 * record for that request to resolve on its own, so
 * Permalink_Routes::resolve_preview_record() reads this SAME
 * `previewRecordId` straight back off the page's own saved content and
 * reuses it as the front-end fallback too -- see that method's own
 * docblock. Not read by render.php itself either way (see that file's
 * own docblock for exactly where it's actually read from instead).
 *
 * Before a Collection is chosen, this shows a plain explanatory
 * placeholder and no editable InnerBlocks area at all -- same "nothing
 * meaningful to template yet" reasoning gateway/related-items' own
 * edit.js already applies before a relationship is picked (a
 * `useInnerBlocksProps()` div and an unrelated placeholder `<p>` can
 * never be siblings inside the SAME element: the props object's own
 * `children` -- the real InnerBlocks list/appender -- would just be
 * overridden by whatever JSX children follow it, silently breaking
 * InnerBlocks editing entirely). Once a Collection is chosen, this
 * switches to the bare `<div { ...innerBlocksProps } />`, exactly the
 * shape every other plain InnerBlocks wrapper in this plugin (e.g.
 * gateway/data-cards-header) already uses.
 *
 * `sourceType`/`collection` are provided as real block context
 * (`gateway/data-cards/sourceType`/`gateway/data-cards/collection` -- see
 * block.json's own `providesContext`, reusing the exact two keys
 * gateway/data-cards already provides), purely so gateway/card-field-text's
 * own Field picker (and gateway/related-items' own Relationship picker)
 * work inside this block's InnerBlocks exactly the way they already do
 * inside a Data Cards grid, rather than showing their own "Choose a
 * Collection on the Data Cards block first" notice, which would be
 * actively wrong advice here (there IS no Data Cards block on this kind
 * of page at all). `sourceType` itself is a fixed, hidden attribute
 * (always `'collection'`, no Inspector control of its own) -- this block
 * only ever has one possible source, unlike Data Cards' own postType/
 * Collection toggle.
 */
export default function Edit( { attributes: { collection, previewRecordId }, setAttributes } ) {
	const blockProps = useBlockProps( { className: 'gateway-single-record' } );

	const inspectorControls = (
		<InspectorControls>
			<PanelBody title={ __( 'Single Record Settings', 'gateway' ) }>
				<CollectionControl
					value={ collection }
					onChange={ ( value ) => {
						setAttributes( { collection: value, previewRecordId: 0 } );
					} }
				/>
				<p className="description">
					{ __(
						'Root and Template Page are configured on this Collection’s own Permalinks tab, under Gateway › Models.',
						'gateway'
					) }
				</p>
			</PanelBody>
			{ collection && (
				<PreviewRecordPanel
					collection={ collection }
					previewRecordId={ previewRecordId }
					onChange={ ( value ) => setAttributes( { previewRecordId: value } ) }
				/>
			) }
		</InspectorControls>
	);

	if ( ! collection ) {
		return (
			<>
				{ inspectorControls }
				<div { ...blockProps }>
					<p className="gateway-single-record__placeholder">
						{ __(
							'Choose a Collection in the Inspector, then design this template below with Gateway blocks (e.g. Card Field Text, Related Items) -- the real record a visitor requested fills them in on the front end.',
							'gateway'
						) }
					</p>
				</div>
			</>
		);
	}

	return (
		<SingleRecordInnerBlocks
			blockProps={ blockProps }
			inspectorControls={ inspectorControls }
			collection={ collection }
			previewRecordId={ previewRecordId }
			setAttributes={ setAttributes }
		/>
	);
}

/**
 * Split out from Edit() purely so `useInnerBlocksProps()` -- a Hook -- is
 * never called conditionally: Edit() itself returns early, before ever
 * rendering this, whenever there's no Collection chosen yet.
 */
function SingleRecordInnerBlocks( {
	blockProps,
	inspectorControls,
	collection,
	previewRecordId,
	setAttributes,
} ) {
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		templateLock: false,
	} );

	const { record, isLoading, hasNoRecords } = usePreviewRecord(
		collection,
		previewRecordId,
		setAttributes
	);

	return (
		<>
			{ inspectorControls }
			{ hasNoRecords && (
				<Notice status="info" isDismissible={ false }>
					{ __(
						'This Collection has no records yet -- add one under Gateway › Records to see a live preview here. You can still design the template below.',
						'gateway'
					) }
				</Notice>
			) }
			{ isLoading ? (
				<div { ...blockProps }>
					<Spinner />
				</div>
			) : (
				<BlockContextProvider value={ record ? { record } : {} }>
					<div { ...innerBlocksProps } />
				</BlockContextProvider>
			) }
		</>
	);
}

/**
 * Resolves which record to preview and fetches it in full -- see this
 * file's own top docblock ("Default record"/"A chosen previewRecordId")
 * for the full reasoning. Kept local to this block rather than promoted
 * to blocks/shared/: gateway/data-cards-body's own preview-record
 * fetching is close in spirit but a genuinely different shape (a paged
 * LIST of records to loop over, not "one record, chosen from a search"),
 * not enough real overlap yet to be worth sharing.
 *
 * @param {string}   collection       Selected model class name.
 * @param {number}   previewRecordId  0 means "use the first record found".
 * @param {Function} setAttributes    Clears a stale previewRecordId back to 0.
 * @return {{record: (Object|null), isLoading: boolean, hasNoRecords: boolean}}
 */
function usePreviewRecord( collection, previewRecordId, setAttributes ) {
	const [ defaultId, setDefaultId ] = useState( null );
	const [ record, setRecord ] = useState( null );
	const [ isLoadingDefault, setIsLoadingDefault ] = useState( true );
	const [ isLoadingRecord, setIsLoadingRecord ] = useState( true );

	// The Collection's own most-recent records (id desc, capped at
	// Records_REST_Controller::SEARCH_LIMIT) -- its first result is "the
	// first record it can find" whenever no previewRecordId has been
	// deliberately chosen. Re-fetched only when the Collection itself
	// changes, never on every previewRecordId change -- this is purely
	// about establishing the DEFAULT, an explicit choice never needs it.
	useEffect( () => {
		let isCurrent = true;
		setIsLoadingDefault( true );
		setDefaultId( null );

		apiFetch( { path: `/gateway/v1/models/${ collection }/records/search` } )
			.then( ( results ) => {
				if ( isCurrent ) {
					setDefaultId( results[ 0 ]?.id ?? 0 );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setDefaultId( 0 );
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoadingDefault( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
	}, [ collection ] );

	const targetId = previewRecordId || defaultId || 0;

	useEffect( () => {
		if ( isLoadingDefault ) {
			// Still waiting to know the default -- unless a real,
			// explicit choice already makes that moot.
			if ( ! previewRecordId ) {
				return;
			}
		}

		if ( ! targetId ) {
			// Resolved, and there's truly nothing to preview -- an empty
			// Collection.
			setRecord( null );
			setIsLoadingRecord( false );
			return;
		}

		let isCurrent = true;
		setIsLoadingRecord( true );

		apiFetch( { path: `/gateway/v1/models/${ collection }/records/${ targetId }` } )
			.then( ( fetched ) => {
				if ( isCurrent ) {
					setRecord( fetched );
				}
			} )
			.catch( () => {
				if ( isCurrent ) {
					setRecord( null );

					if ( previewRecordId === targetId ) {
						// The explicitly-chosen record is gone (deleted
						// since it was picked) -- fall back to "first
						// record found" automatically rather than
						// leaving this stuck on a permanent miss.
						setAttributes( { previewRecordId: 0 } );
					}
				}
			} )
			.finally( () => {
				if ( isCurrent ) {
					setIsLoadingRecord( false );
				}
			} );

		return () => {
			isCurrent = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- setAttributes
		// intentionally excluded: it's a stable function reference from the
		// block's own props, including it would add nothing but noise.
	}, [ collection, targetId, isLoadingDefault, previewRecordId ] );

	// An explicit previewRecordId never needs to wait on the unrelated
	// "what's the default" fetch above -- only the auto ("first record
	// found") path genuinely depends on it resolving first.
	const isLoading = previewRecordId ? isLoadingRecord : isLoadingDefault || isLoadingRecord;

	return {
		record,
		isLoading,
		hasNoRecords: ! isLoading && ! targetId,
	};
}

/**
 * The Inspector's own "select a different record to use as the preview"
 * control -- a `ComboboxControl` (search-as-you-type, not a plain
 * `<select>`: the same "a possibly large table deserves searching, not
 * every row rendered as an option" reasoning RelateAutocomplete.jsx's own
 * docblock already gives for a Relate field) backed by the exact same
 * `.../records/search?q=` route, debounced 300ms to match that
 * component's own timing.
 */
function PreviewRecordPanel( { collection, previewRecordId, onChange } ) {
	const [ query, setQuery ] = useState( '' );
	const [ options, setOptions ] = useState( [] );
	const [ selectedLabel, setSelectedLabel ] = useState( '' );

	useEffect( () => {
		let isCurrent = true;

		const handle = setTimeout( () => {
			const params = query ? `?q=${ encodeURIComponent( query ) }` : '';

			apiFetch( { path: `/gateway/v1/models/${ collection }/records/search${ params }` } )
				.then( ( results ) => {
					if ( isCurrent ) {
						setOptions( results );
					}
				} )
				.catch( () => {
					if ( isCurrent ) {
						setOptions( [] );
					}
				} );
		}, 300 );

		return () => {
			isCurrent = false;
			clearTimeout( handle );
		};
	}, [ collection, query ] );

	// Keeps the Combobox's own displayed text matching the CURRENTLY
	// -selected record's real label, even once it's scrolled out of the
	// latest search results (e.g. right after picking it, before typing
	// anything else) -- looked up from whichever result list happens to
	// still contain it, falling back to the bare id if it doesn't (rare:
	// only right after this very panel mounts, before its own first
	// fetch above resolves).
	useEffect( () => {
		if ( ! previewRecordId ) {
			setSelectedLabel( '' );
			return;
		}

		const match = options.find( ( option ) => option.id === previewRecordId );

		setSelectedLabel( match ? match.label : `#${ previewRecordId }` );
	}, [ previewRecordId, options ] );

	return (
		<PanelBody title={ __( 'Preview Record', 'gateway' ) }>
			<ComboboxControl
				__nextHasNoMarginBottom
				label={ __( 'Record', 'gateway' ) }
				value={ previewRecordId || '' }
				options={ options.map( ( option ) => ( {
					label: option.label,
					value: option.id,
				} ) ) }
				onFilterValueChange={ setQuery }
				onChange={ ( value ) => onChange( value ? Number( value ) : 0 ) }
				help={ __(
					'Which record fills in the preview below while you design this template -- purely an editing convenience. A real visitor always sees the actual record their own URL resolved to.',
					'gateway'
				) }
			/>
			{ ! previewRecordId && (
				<p className="description">
					{ __( 'Showing the first record found.', 'gateway' ) }
				</p>
			) }
			{ previewRecordId && (
				<p className="description">
					{ sprintf(
						/* translators: %s: the chosen record's own display label */
						__( 'Previewing “%s”.', 'gateway' ),
						selectedLabel
					) }
				</p>
			) }
		</PanelBody>
	);
}
