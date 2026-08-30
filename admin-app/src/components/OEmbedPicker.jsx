import { useEffect, useRef, useState } from 'react';
import { fetchOembedPreview } from '../api.js';

// ACF's own oEmbed field falls back to 640×390 when Embed Size is left
// blank -- mirrored here so a field with no configured size still gets
// a sensibly-sized preview instead of whatever a provider's own default
// happens to be.
const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 390;

const DEBOUNCE_MS = 500;

/**
 * An oEmbed field's own control -- a plain URL `<input>` plus a live
 * embed preview fetched from WordPress's own oEmbed proxy route
 * (`GET /wp-json/oembed/1.0/proxy`, the exact one the block editor's
 * own Embed block and ACF's own oEmbed field both use), rather than
 * this plugin implementing its own oEmbed discovery/caching. The proxy
 * -- not a raw client-side fetch straight to whatever URL was typed --
 * is what actually makes this safe: it's WordPress itself doing the
 * discovery/fetch server-side (with its own allow-list of providers)
 * and returning already-sanitized markup, the same trust boundary
 * every other oEmbed consumer in WordPress already relies on.
 *
 * Unlike ImagePicker/FilePicker, `value` here is always just a plain
 * URL string (or null) -- never an enriched object -- since
 * `OEmbed_Field_Type` stores exactly what was typed and nothing else
 * (see that class's own docblock for why there's no `resolve_*_value()`
 * counterpart at all). That makes this a genuinely controlled input:
 * `onChange` fires on every keystroke with the raw string, the same as
 * a plain `<input type="url">` would, no reduction needed anywhere else
 * in `RecordForm`.
 *
 * The preview itself is debounced (500ms -- longer than
 * `RelateAutocomplete`'s own 300ms search debounce, since a real
 * network fetch to an external provider by way of the proxy is slower
 * and more expensive than a local database search) and keyed off both
 * the URL and this field's own configured `embed_width`/`embed_height`
 * (`Field_Type::supports_embed_settings()`) -- changing either
 * re-fetches, so the preview always reflects the field's current
 * settings, not just whatever size happened to be active when the URL
 * was first typed.
 */
export default function OEmbedPicker( { field, value, onChange } ) {
	const settings = field.settings || {};
	const [ preview, setPreview ] = useState( null );
	const [ error, setError ] = useState( '' );
	const [ loading, setLoading ] = useState( false );
	const requestIdRef = useRef( 0 );

	const width = settings.embed_width || DEFAULT_WIDTH;
	const height = settings.embed_height || DEFAULT_HEIGHT;

	useEffect( () => {
		setError( '' );

		if ( ! value || ! value.trim() ) {
			setPreview( null );
			return;
		}

		setLoading( true );
		// Distinguishes this call's own eventual response from a newer
		// one fired by a later keystroke/settings change -- without
		// this, a slow request for an EARLIER url could still resolve
		// after a faster one for the current url and clobber its
		// preview with stale content.
		const requestId = ++requestIdRef.current;

		const handle = setTimeout( () => {
			fetchOembedPreview( value, width, height )
				.then( ( data ) => {
					if ( requestId === requestIdRef.current ) {
						setPreview( data );
						setLoading( false );
					}
				} )
				.catch( () => {
					if ( requestId === requestIdRef.current ) {
						setPreview( null );
						setError( 'No embed found for that URL.' );
						setLoading( false );
					}
				} );
		}, DEBOUNCE_MS );

		return () => clearTimeout( handle );
	}, [ value, width, height ] );

	return (
		<div className="gateway-oembed-picker">
			<input
				type="url"
				className="regular-text"
				placeholder="https://example.com/…"
				value={ value || '' }
				onChange={ ( event ) => onChange( event.target.value ) }
			/>
			{ loading && (
				<p className="description gateway-oembed-picker-status">
					Loading preview…
				</p>
			) }
			{ error && (
				<span className="gateway-oembed-picker-error">{ error }</span>
			) }
			{ preview?.html && (
				<div
					className="gateway-oembed-picker-preview"
					// The proxy's own response is already sanitized
					// server-side (see this component's own docblock) --
					// the same trust level every other oEmbed consumer in
					// WordPress already extends its own `.html` response.
					dangerouslySetInnerHTML={ { __html: preview.html } }
				/>
			) }
		</div>
	);
}
