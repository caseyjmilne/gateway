import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';

/**
 * A Markdown field's own control -- `@uiw/react-md-editor`'s `MDEditor`,
 * per a direct request ("Use a react markdown editor and enable us to
 * easily make markdown content"). A genuinely CONTROLLED React
 * component (plain `value`/`onChange`, exactly like every other field
 * here) -- unlike `WysiwygEditor`'s own TinyMCE integration, which has
 * to be deliberately uncontrolled because TinyMCE owns its own DOM/
 * iframe (see that component's own docblock for the full "why"), this
 * package's own toolbar + textarea + live preview are all plain React
 * underneath, so there's no imperative init/teardown dance needed here
 * at all -- this is about as close to a bare `<textarea>` as the rest
 * of RecordForm's own inputs get.
 *
 * `preview="live"` shows the rendered result side-by-side WHILE typing
 * -- a genuinely useful editing aid, but only ever a preview: it's this
 * package's own bundled `react-markdown`-based renderer, not
 * `Markdown_Converter`'s own `league/commonmark` (the real, canonical
 * conversion `gateway/card-field-markdown`'s render.php actually
 * applies on the front end) -- the two are independent Markdown
 * implementations that render the overwhelming majority of real-world
 * Markdown identically, but AREN'T guaranteed to agree on every last
 * edge case (this preview also, unlike CommonMark's own safe config on
 * the front end, doesn't sanitize raw embedded HTML -- fine for a
 * manage_options-only editing screen, since anyone here already has the
 * same trust WysiwygEditor's own raw-HTML value gets, but still worth
 * knowing this preview and the real front-end render aren't from the
 * identical code path).
 *
 * `data-color-mode="light"` pins this to wp-admin's own light chrome
 * regardless of the visiting browser/OS's own dark-mode preference,
 * which this package otherwise auto-detects and switches to on its
 * own -- every other control on this screen already assumes light
 * wp-admin styling, so a dark editor dropped into the middle of it
 * would look like a rendering bug, not a feature.
 */
export default function MarkdownEditor( { field, value, onChange } ) {
	return (
		<div className="gateway-markdown-editor" data-color-mode="light">
			<MDEditor
				value={ value || '' }
				onChange={ ( newValue ) => onChange( newValue || '' ) }
				height={ 320 }
				preview="live"
				textareaProps={ {
					id: `gateway-markdown-${ field.name }`,
					placeholder: field.settings?.placeholder || '',
				} }
			/>
		</div>
	);
}
