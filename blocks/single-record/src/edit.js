import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useSelect } from '@wordpress/data';
import { useEntityProp } from '@wordpress/core-data';
import { store as editorStore } from '@wordpress/editor';
import {
	BlockContextProvider,
	useBlockProps,
	useInnerBlocksProps,
} from '@wordpress/block-editor';
import { Notice, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Editor UI for the gateway/single-record block. A real, live preview
 * record feeds the InnerBlocks area via block context (`record`), the
 * same unnamespaced key gateway/data-cards-body's own edit.js already
 * provides for its per-item previews -- so gateway/card-field-text/
 * -number/-image and gateway/related-items all show real data while
 * designing the template here too, not just on the front end.
 *
 * Unlike an earlier version of this block, "which Collection is this
 * Template for" and "which record previews it" are no longer this
 * block's OWN attributes at all -- they're read straight off the
 * current Template post's own meta (`Template_Post_Type::META_COLLECTION`/
 * `META_PREVIEW_RECORD_ID`), the same meta the "Gateway Template" sidebar
 * panel (`src/template-panel.js`) is the ONE place a site owner actually
 * sets them. This collapses what used to be two settings that had to
 * agree (this block's own `collection` attribute, and a Model's own
 * `template_page_id` pointing back at whichever Page held it) into one:
 * a Template post simply declares, once, which Collection it's for.
 *
 * **Default record** -- `GET .../records/search` with no `q` (the same
 * route RelateAutocomplete.jsx already uses for a Relate to One/Many
 * field's own search-as-you-type, here reused purely for its "no query
 * -> the model's own most-recent records, id desc, capped at
 * Records_REST_Controller::SEARCH_LIMIT" behavior) doubles as both the
 * sidebar panel's own Combobox default option list AND, absent a
 * deliberately chosen preview record, the source of "the first record
 * it can find": its own first result. Cheap and already-built, rather
 * than a second route -- this never needs more than a `{id, label}`
 * pair to know WHICH record is first; the full record itself is fetched
 * separately, below.
 *
 * **A chosen preview record** is looked up directly via
 * `GET .../records/<id>` regardless of whether it's still one of the
 * search route's own most-recent results (a deliberately-searched-for
 * OLDER record, picked specifically because it isn't one of those,
 * would otherwise never resolve) -- and if that lookup 404s (the record
 * was since deleted), the meta is cleared back to `0` so this falls
 * back to "the first record it can find" again automatically, rather
 * than leaving the template stuck on a permanent error.
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
 * whichever record happened to be selected here last -- the preview
 * record meta plays no part in that path at all. A direct visit to the
 * Template post's OWN url (no slug in it at all) is different: there's
 * no real record for that request to resolve on its own, so
 * Permalink_Routes::resolve_preview_record() reads this SAME meta key
 * straight back off the post and reuses it as the front-end fallback
 * too -- see that method's own docblock.
 *
 * Before a Collection is chosen (in the sidebar panel), this shows a
 * plain explanatory placeholder and no editable InnerBlocks area at all
 * -- same "nothing meaningful to template yet" reasoning gateway/related
 * -items' own edit.js already applies before a relationship is picked (a
 * `useInnerBlocksProps()` div and an unrelated placeholder `<p>` can
 * never be siblings inside the SAME element: the props object's own
 * `children` -- the real InnerBlocks list/appender -- would just be
 * overridden by whatever JSX children follow it, silently breaking
 * InnerBlocks editing entirely). Once a Collection is chosen, this
 * switches to the bare `<div { ...innerBlocksProps } />`, exactly the
 * shape every other plain InnerBlocks wrapper in this plugin (e.g.
 * gateway/data-cards-empty) already uses.
 */
export default function Edit() {
	const blockProps = useBlockProps( { className: 'gateway-single-record' } );

	const postType = useSelect(
		( select ) => select( editorStore ).getCurrentPostType(),
		[]
	);
	const [ meta, setMeta ] = useEntityProp( 'postType', postType, 'meta' );

	const collection = ( meta && meta._gateway_template_collection ) || '';
	const previewRecordId = Number(
		( meta && meta._gateway_template_preview_record_id ) || 0
	);

	if ( ! collection ) {
		return (
			<div { ...blockProps }>
				<p className="gateway-single-record__placeholder">
					{ __(
						'Choose a Model in the “Gateway Template” panel (top right of this screen), then design this template below with Gateway blocks (e.g. Card Field Text, Related Items) -- the real record a visitor requested fills them in on the front end.',
						'gateway'
					) }
				</p>
			</div>
		);
	}

	return (
		<SingleRecordInnerBlocks
			blockProps={ blockProps }
			collection={ collection }
			previewRecordId={ previewRecordId }
			onStalePreviewRecord={ () =>
				setMeta( { ...meta, _gateway_template_preview_record_id: 0 } )
			}
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
	collection,
	previewRecordId,
	onStalePreviewRecord,
} ) {
	const innerBlocksProps = useInnerBlocksProps( blockProps, {
		templateLock: false,
	} );

	const { record, isLoading, hasNoRecords } = usePreviewRecord(
		collection,
		previewRecordId,
		onStalePreviewRecord
	);

	return (
		<>
			{ hasNoRecords && (
				<Notice status="info" isDismissible={ false }>
					{ __(
						'This Model has no records yet -- add one under Gateway › Records to see a live preview here. You can still design the template below.',
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
 * file's own top docblock ("Default record"/"A chosen preview record")
 * for the full reasoning. Kept local to this block rather than promoted
 * to blocks/shared/: gateway/data-cards-body's own preview-record
 * fetching is close in spirit but a genuinely different shape (a paged
 * LIST of records to loop over, not "one record, chosen from a search"),
 * not enough real overlap yet to be worth sharing.
 *
 * @param {string}   collection            Selected model class name.
 * @param {number}   previewRecordId       0 means "use the first record found".
 * @param {Function} onStalePreviewRecord  Called to clear a previewRecordId that no longer resolves.
 * @return {{record: (Object|null), isLoading: boolean, hasNoRecords: boolean}}
 */
function usePreviewRecord( collection, previewRecordId, onStalePreviewRecord ) {
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
						onStalePreviewRecord();
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
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onStalePreviewRecord
		// intentionally excluded: it's a fresh closure every render, including
		// it would defeat this effect's own [collection, targetId, ...] gating.
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
