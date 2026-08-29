import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

// Maps a file extension (as typed into an Image field's own "Allowed
// File Types" setting, e.g. "jpg,png,gif") to the MIME type wp.media()'s
// own `library.type` filter actually expects -- extensions are what a
// site owner naturally types, MIME types are what the picker needs.
// Only the extensions WordPress itself accepts as image uploads by
// default are covered; an unrecognized one is simply left out of the
// picker's own filter (still enforced server-side either way, by
// Model_Fields::validate_image_constraints() checking the real file
// extension directly, not this map).
const EXTENSION_TO_MIME = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	gif: 'image/gif',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	bmp: 'image/bmp',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	ico: 'image/vnd.microsoft.icon',
};

const parseAllowedTypes = ( raw ) =>
	( raw || '' )
		.split( /[,\s]+/ )
		.map( ( ext ) => ext.trim().toLowerCase() )
		.filter( Boolean );

/**
 * Runs the same three checks `Model_Fields::validate_image_constraints()`
 * enforces server-side, against the attachment JS model's own attributes
 * -- a client-side convenience only (an immediate "this won't be
 * accepted" instead of waiting for the record save to fail), never a
 * substitute for that server-side enforcement, the same "client hint,
 * server enforces" split every other Validation-tab setting in this app
 * already has.
 *
 * @param {object} attachment wp.media() attachment.toJSON() shape.
 * @param {object} settings   The field's own settings object.
 * @return {string|null} A rejection message, or null if it passes.
 */
function validateAttachment( attachment, settings ) {
	const allowed = parseAllowedTypes( settings.allowed_types );

	if ( allowed.length > 0 ) {
		const extension = ( attachment.filename || attachment.url || '' )
			.split( '.' )
			.pop()
			.toLowerCase();

		if ( ! allowed.includes( extension ) ) {
			return `Must be one of: ${ allowed.join( ', ' ) }.`;
		}
	}

	const width = attachment.width;
	const height = attachment.height;
	const sizeMb = attachment.filesizeInBytes
		? attachment.filesizeInBytes / ( 1024 * 1024 )
		: null;

	if ( settings.min_width && width && width < Number( settings.min_width ) ) {
		return `Width must be at least ${ settings.min_width }px.`;
	}
	if ( settings.max_width && width && width > Number( settings.max_width ) ) {
		return `Width must be at most ${ settings.max_width }px.`;
	}
	if ( settings.min_height && height && height < Number( settings.min_height ) ) {
		return `Height must be at least ${ settings.min_height }px.`;
	}
	if ( settings.max_height && height && height > Number( settings.max_height ) ) {
		return `Height must be at most ${ settings.max_height }px.`;
	}
	if ( settings.min_size && null !== sizeMb && sizeMb < Number( settings.min_size ) ) {
		return `File size must be at least ${ settings.min_size }MB.`;
	}
	if ( settings.max_size && null !== sizeMb && sizeMb > Number( settings.max_size ) ) {
		return `File size must be at most ${ settings.max_size }MB.`;
	}

	return null;
}

/**
 * An Image field's own picker -- opens the exact same WordPress media
 * modal (`wp.media()`) a post editor's Featured Image button does,
 * rather than this plugin building its own upload UI from scratch (see
 * `Admin_Page::enqueue_assets()`'s own `wp_enqueue_media()` call, what
 * actually makes `window.wp.media` available on this screen at all).
 *
 * `value` -- like a Relate to One field's own `{id, label}` -- can be
 * richer than the bare attachment id this field's own DB column actually
 * stores: for an EXISTING record, it's whatever shape the field's
 * configured `return_format` gave the record's own GET response (a bare
 * number for `'id'`, a plain URL string for `'url'`, or the full
 * `{id, url, width, height, sizes}` object for `'array'`) -- `RecordForm`'s
 * own `handleSubmit()` is what actually extracts a bare id back out at
 * submit time, the same "keep the richer shape in form state, reduce to
 * an id only when building the payload" split a Relate to One field's
 * own `{id, label}` already has. Freshly picking a NEW image (below)
 * always normalizes into that same rich object shape regardless of
 * `return_format` -- wp.media()'s own attachment model already has
 * everything needed for a preview for free, no extra round trip.
 *
 * A bare numeric `value` (return_format `'id'`) can't render its own
 * preview directly -- one extra `GET /gateway/v1/media/<id>` fetches the
 * same rich shape purely for that purpose, on mount, without changing
 * what's actually stored in form state (still just the id). A bare
 * STRING `value` (return_format `'url'`) has the opposite problem: it's
 * enough to render a preview from directly, but carries no id at all --
 * fine for reading, a real problem for writing, since resubmitting an
 * untouched record still needs a valid id to send back, not the URL
 * `Records_REST_Controller::resolve_image_value()` reduced it to for
 * THIS field's own `return_format`. `GET /gateway/v1/media-by-url`
 * (`attachment_url_to_postid()` server-side) resolves the real id back
 * from the URL on mount, and `onChange()` is called with it right away
 * -- a one-time, transparent normalization of this field's own form
 * value from a string to a number, not a change the person editing the
 * record ever sees or has to do anything about.
 */
export default function ImagePicker( { field, value, onChange } ) {
	const settings = field.settings || {};
	const [ preview, setPreview ] = useState( null );
	const [ error, setError ] = useState( '' );

	useEffect( () => {
		setError( '' );

		if ( null === value || undefined === value || '' === value ) {
			setPreview( null );
			return;
		}

		if ( 'object' === typeof value ) {
			setPreview( value );
			return;
		}

		let cancelled = false;

		if ( 'string' === typeof value ) {
			// return_format 'url' -- resolve the real id back so this
			// field's own form value can be normalized to it (see this
			// component's own docblock for why that matters even though
			// nothing about the record is actually changing here).
			apiFetch( `/media-by-url?url=${ encodeURIComponent( value ) }` )
				.then( ( data ) => {
					if ( ! cancelled ) {
						setPreview( data );
						onChange( data.id );
					}
				} )
				.catch( () => {
					if ( ! cancelled ) {
						// Couldn't resolve it back to a real attachment
						// (deleted from the media library since, e.g.) --
						// still show SOMETHING using the URL directly
						// rather than a blank picker, even though it
						// can't be normalized to an id this way.
						setPreview( { url: value, sizes: {} } );
					}
				} );

			return () => {
				cancelled = true;
			};
		}

		// A bare id (return_format 'id') -- fetch the same rich shape
		// purely to render a preview from; the form's own value stays
		// just the id regardless.
		apiFetch( `/media/${ value }` )
			.then( ( data ) => {
				if ( ! cancelled ) {
					setPreview( data );
				}
			} )
			.catch( () => {} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- onChange
		// intentionally excluded: RecordForm passes a fresh closure every
		// render, and including it here would re-run this effect (and
		// re-fetch) on every keystroke elsewhere in the form, not just
		// when this field's own value actually changes.
	}, [ value ] );

	const openMediaLibrary = () => {
		if ( ! window.wp || ! window.wp.media ) {
			setError( 'The media library isn\'t available on this page.' );
			return;
		}

		const allowedMimes = parseAllowedTypes( settings.allowed_types )
			.map( ( ext ) => EXTENSION_TO_MIME[ ext ] )
			.filter( Boolean );

		const frame = window.wp.media( {
			title: 'Select Image',
			button: { text: 'Use this image' },
			multiple: false,
			library: {
				type: allowedMimes.length > 0 ? allowedMimes : 'image',
			},
		} );

		frame.on( 'select', () => {
			const attachment = frame
				.state()
				.get( 'selection' )
				.first()
				.toJSON();

			const rejection = validateAttachment( attachment, settings );

			if ( rejection ) {
				setError( rejection );
				return;
			}

			setError( '' );
			setPreview( attachment );
			onChange( attachment.id );
		} );

		frame.open();
	};

	const previewSize = settings.preview_size || 'full';
	const previewUrl =
		preview?.sizes?.[ previewSize ]?.url || preview?.url || null;

	return (
		<div className="gateway-image-picker">
			{ previewUrl && (
				<div className="gateway-image-picker-preview">
					<img src={ previewUrl } alt={ preview?.alt || '' } />
				</div>
			) }
			<div className="gateway-image-picker-actions">
				<button
					type="button"
					className="button"
					onClick={ openMediaLibrary }
				>
					{ previewUrl ? 'Change Image' : 'Select Image' }
				</button>
				{ previewUrl && (
					<button
						type="button"
						className="button"
						onClick={ () => {
							setPreview( null );
							setError( '' );
							onChange( null );
						} }
					>
						Remove
					</button>
				) }
			</div>
			{ error && (
				<span className="gateway-image-picker-error">{ error }</span>
			) }
		</div>
	);
}
