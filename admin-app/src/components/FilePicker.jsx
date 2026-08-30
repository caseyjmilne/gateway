import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const parseAllowedTypes = ( raw ) =>
	( raw || '' )
		.split( /[,\s]+/ )
		.map( ( ext ) => ext.trim().toLowerCase() )
		.filter( Boolean );

/**
 * Runs the same two checks `Model_Fields::validate_attachment_constraints()`
 * enforces server-side for a File field (no width/height -- see that
 * method's own docblock for why those two simply never apply here),
 * against the attachment JS model's own attributes -- a client-side
 * convenience only, the same "client hint, server enforces" split
 * `ImagePicker.jsx`'s own `validateAttachment()` already has.
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

	const sizeMb = attachment.filesizeInBytes
		? attachment.filesizeInBytes / ( 1024 * 1024 )
		: null;

	if ( settings.min_size && null !== sizeMb && sizeMb < Number( settings.min_size ) ) {
		return `File size must be at least ${ settings.min_size }MB.`;
	}
	if ( settings.max_size && null !== sizeMb && sizeMb > Number( settings.max_size ) ) {
		return `File size must be at most ${ settings.max_size }MB.`;
	}

	return null;
}

/**
 * A File field's own picker -- `ImagePicker.jsx`'s own close sibling,
 * same `wp.media()` modal, same three-`return_format`-shape/normalize
 * -on-load handling for an existing record's value (see that
 * component's own docblock for the full "why" of both -- identical here,
 * not repeated), same `GET /gateway/v1/media/<id>`/`media-by-url`
 * fetches for the id/url shapes, just with `?kind=file` appended so
 * `Media_REST_Controller` dispatches to `Records_REST_Controller::
 * resolve_file_value()` instead of `resolve_image_value()`.
 *
 * Two real differences from Image's own picker:
 *
 * - No MIME-based `library.type` filter on the modal itself. Image's own
 *   `EXTENSION_TO_MIME` map works because there's a small, fixed set of
 *   raster formats to cover; an arbitrary file's own `allowed_types`
 *   (`.pdf`, `.docx`, `.zip`, ...) has no such small, reliable table --
 *   see `Field_Type::supports_file_settings()`'s own docblock for the
 *   full reasoning. The modal opens fully unrestricted; `allowed_types`
 *   is still enforced right here at pick time (`validateAttachment()`
 *   above) and, authoritatively, server-side.
 *
 * - The preview is a filename/title link, not an `<img>` -- there's no
 *   meaningful thumbnail for a .zip or a .docx the way there is for an
 *   actual image, so this shows whatever `resolve_file_value()`/a
 *   freshly-picked attachment's own JSON calls the file (`filename`,
 *   falling back to `title`, falling back to the bare URL) as a link
 *   straight to the file itself.
 */
export default function FilePicker( { field, value, onChange } ) {
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
			// field's own form value can be normalized to it (see
			// ImagePicker.jsx's own docblock for why that matters even
			// though nothing about the record is actually changing here).
			apiFetch( `/media-by-url?url=${ encodeURIComponent( value ) }&kind=file` )
				.then( ( data ) => {
					if ( ! cancelled ) {
						setPreview( data );
						onChange( data.id );
					}
				} )
				.catch( () => {
					if ( ! cancelled ) {
						// Couldn't resolve it back to a real attachment --
						// still show SOMETHING using the URL directly
						// rather than a blank picker.
						setPreview( { url: value } );
					}
				} );

			return () => {
				cancelled = true;
			};
		}

		// A bare id (return_format 'id') -- fetch the same rich shape
		// purely to render a preview from; the form's own value stays
		// just the id regardless.
		apiFetch( `/media/${ value }?kind=file` )
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
		// intentionally excluded, same reasoning as ImagePicker.jsx's own
		// identical effect.
	}, [ value ] );

	const openMediaLibrary = () => {
		if ( ! window.wp || ! window.wp.media ) {
			setError( 'The media library isn\'t available on this page.' );
			return;
		}

		const frame = window.wp.media( {
			title: 'Select File',
			button: { text: 'Use this file' },
			multiple: false,
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

	const previewUrl = preview?.url || null;
	const previewLabel = preview?.filename || preview?.title || previewUrl;

	return (
		<div className="gateway-file-picker">
			{ previewUrl && (
				<div className="gateway-file-picker-preview">
					<a href={ previewUrl } target="_blank" rel="noreferrer">
						{ previewLabel }
					</a>
				</div>
			) }
			<div className="gateway-file-picker-actions">
				<button
					type="button"
					className="button"
					onClick={ openMediaLibrary }
				>
					{ previewUrl ? 'Change File' : 'Select File' }
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
				<span className="gateway-file-picker-error">{ error }</span>
			) }
		</div>
	);
}
