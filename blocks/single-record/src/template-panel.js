import { useEffect, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useSelect } from '@wordpress/data';
import { useEntityProp } from '@wordpress/core-data';
import { store as editorStore, PluginDocumentSettingPanel } from '@wordpress/editor';
import { registerPlugin } from '@wordpress/plugins';
import { ComboboxControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';

import CollectionControl from '../../shared/controls/collection-control';

/**
 * The "Gateway Template" sidebar panel -- the ONE place a site owner
 * sets which Collection a `gateway_templates` post is for, and which of
 * that Collection's records previews it while being designed. Both are
 * stored as this post's own meta
 * (`Template_Post_Type::META_COLLECTION`/`META_PREVIEW_RECORD_ID`), read
 * back by `gateway/single-record`'s own edit.js (the live preview/
 * InnerBlocks context) and by `Permalink_Routes` on the front end -- see
 * either of those files' own docblocks for the full picture. Replaces
 * what used to be this block's own Inspector controls (`collection`/
 * `previewRecordId` attributes) -- moved here because the association
 * is a property of the TEMPLATE POST, not of one block instance on it,
 * the same "settings that aren't really about one field belong with the
 * rest of that object's own configuration" reasoning
 * `PermalinkEditor.jsx`'s own docblock already gives for keeping Root
 * off `FieldEditor`'s per-field panel.
 *
 * Bundled into `gateway/single-record`'s own `editorScript` (this file
 * is imported by `src/index.js`) rather than a separate build entry --
 * WordPress already enqueues every registered block's `editorScript`
 * unconditionally in the block editor (unlike a `viewScript`, which only
 * loads when that block is actually present on the page), so this runs
 * everywhere the editor does, and simply renders nothing (`postType`
 * check below) outside a `gateway_templates` post.
 */
function GatewayTemplatePanel() {
	const postType = useSelect(
		( select ) => select( editorStore ).getCurrentPostType(),
		[]
	);
	const [ meta, setMeta ] = useEntityProp( 'postType', postType, 'meta' );

	// Pre-selects the Collection when arriving here via a Model's own
	// Single Record tab "Add Template" link (`?model=<class>` on
	// `post-new.php`) -- that link already knows exactly which Model this
	// fresh Template is for; without this, a site owner would have to
	// re-pick it here immediately after just having come from there. The
	// `meta._gateway_template_collection` guard makes this a one-time,
	// harmless no-op on any already-configured Template (edited later via
	// `post.php?post=<id>&action=edit`, which never carries `model` at
	// all) and on a second visit to this same URL. Runs unconditionally
	// every render (the `postType` check moves INSIDE the effect, not
	// before it) -- Hooks can't follow the early `return null` below.
	useEffect( () => {
		if ( 'gateway_templates' !== postType ) {
			return;
		}

		if ( meta && meta._gateway_template_collection ) {
			return;
		}

		const presetCollection = new URLSearchParams( window.location.search ).get( 'model' );

		if ( presetCollection ) {
			setMeta( { ...meta, _gateway_template_collection: presetCollection } );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- meta/setMeta
		// come from useEntityProp and meta's own identity changes on every
		// write; only postType and meta's OWN presence should re-trigger
		// this (re-running once more right after the write above is a
		// harmless no-op, since _gateway_template_collection is then
		// already set).
	}, [ postType, meta ] );

	if ( 'gateway_templates' !== postType ) {
		return null;
	}

	const collection = ( meta && meta._gateway_template_collection ) || '';
	const previewRecordId = Number(
		( meta && meta._gateway_template_preview_record_id ) || 0
	);

	return (
		<PluginDocumentSettingPanel
			name="gateway-template"
			title={ __( 'Gateway Template', 'gateway' ) }
		>
			<CollectionControl
				value={ collection }
				onChange={ ( value ) =>
					setMeta( {
						...meta,
						_gateway_template_collection: value,
						_gateway_template_preview_record_id: 0,
					} )
				}
			/>
			<p className="description">
				{ __(
					'Root is configured on this Model’s own Single Record tab, under Gateway › Models.',
					'gateway'
				) }
			</p>
			{ collection && (
				<PreviewRecordControl
					collection={ collection }
					previewRecordId={ previewRecordId }
					onChange={ ( value ) =>
						setMeta( {
							...meta,
							_gateway_template_preview_record_id: value,
						} )
					}
				/>
			) }
		</PluginDocumentSettingPanel>
	);
}

/**
 * "Select a different record to use as the preview" -- a `ComboboxControl`
 * (search-as-you-type, not a plain `<select>`: the same "a possibly
 * large table deserves searching, not every row rendered as an option"
 * reasoning RelateAutocomplete.jsx's own docblock already gives for a
 * Relate field) backed by the same `.../records/search?q=` route
 * `gateway/single-record`'s own edit.js already fetches, debounced 300ms
 * to match that component's own timing.
 */
function PreviewRecordControl( { collection, previewRecordId, onChange } ) {
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
		<>
			<ComboboxControl
				__nextHasNoMarginBottom
				label={ __( 'Preview Record', 'gateway' ) }
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
		</>
	);
}

registerPlugin( 'gateway-template-panel', { render: GatewayTemplatePanel } );
