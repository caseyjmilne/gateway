import { useEffect, useRef, useState } from 'react';

let instanceCounter = 0;

/**
 * A WYSIWYG field's own control -- the real WordPress classic editor
 * (`window.wp.editor.initialize()`, wrapping TinyMCE + quicktags), the
 * exact same one a post's own content field and ACF's own WYSIWYG field
 * both use, rather than a bundled rich-text library of this plugin's
 * own. `Admin_Page::enqueue_assets()`'s own `wp_enqueue_editor()` call is
 * what actually makes `window.wp.editor` available on this screen at
 * all (the same "loads WP's own JS, doesn't reimplement it" pattern
 * `wp_enqueue_media()` already has for Image/File's own pickers).
 *
 * Deliberately UNCONTROLLED from React's own side, unlike every plain
 * `<input>`/`<textarea>` elsewhere in this form: TinyMCE owns the actual
 * DOM/content once initialized (it manages its own iframe, toolbar,
 * undo history, ...), so a React `value` prop fighting it on every
 * keystroke is a well-known anti-pattern for wrapping this kind of
 * imperative editor -- the cursor would jump to the start of the
 * content on every single character typed. `value` is read only ONCE,
 * to seed the underlying `<textarea>`'s own initial content before
 * `wp.editor.initialize()` reads it; every change after that flows the
 * other direction, out to `onChange`, which is how RecordForm's own
 * form state actually stays in sync -- the same "read once to seed,
 * write out on change" split `RecordForm`'s own `initialValues` already
 * has relative to `values` state generally, just enforced more strictly
 * here because the DOM itself (not just React's copy of it) would
 * otherwise disagree with a re-render.
 *
 * Two separate places a change can come from, both wired to the same
 * `onChange`: TinyMCE's own `editor.on('change input undo redo
 * setcontent', ...)` covers the "Visual" tab; the underlying
 * `<textarea>`'s own native `input` event covers the "Text" tab (WP's
 * own Visual/Text tab switch just hides/shows the TinyMCE iframe over
 * the same textarea -- typing directly into the textarea while "Text"
 * is showing never fires any TinyMCE event at all, since the editor
 * itself is merely hidden, not destroyed).
 *
 * A fresh, random DOM id per mounted instance (not just `field.name`)
 * is what keeps two `wp.editor.initialize()` calls for the same field
 * from ever colliding on one shared id -- RecordsCrud's own Add New and
 * Edit are both modals now, so only one is ever actually showing at
 * once in the current UI, but nothing here should have to assume that
 * stays true forever (a future screen embedding two of these at once,
 * or a remount racing a not-yet-finished `wp.editor.remove()` from the
 * previous instance) for this to still behave correctly.
 */
export default function WysiwygEditor( { field, value, onChange } ) {
	const [ idSuffix ] = useState( () => ++instanceCounter );
	const editorId = `gateway-wysiwyg-${ idSuffix }`;
	const textareaRef = useRef( null );
	const [ unavailable, setUnavailable ] = useState( false );

	// Always current, without re-initializing the editor whenever
	// RecordForm passes a fresh onChange closure on every render (the
	// same reason ImagePicker/FilePicker's own effects exclude onChange
	// from their dependency arrays instead of reacting to it).
	const onChangeRef = useRef( onChange );
	useEffect( () => {
		onChangeRef.current = onChange;
	} );

	useEffect( () => {
		if ( ! window.wp || ! window.wp.editor ) {
			setUnavailable( true );
			return;
		}

		window.wp.editor.initialize( editorId, {
			tinymce: {
				wpautop: true,
				toolbar1:
					'formatselect bold italic bullist numlist blockquote alignleft aligncenter alignright link unlink wp_adv',
				toolbar2:
					'strikethrough hr forecolor pastetext removeformat charmap outdent indent undo redo wp_help',
				setup( editor ) {
					editor.on( 'change input undo redo setcontent', () => {
						onChangeRef.current( editor.getContent() );
					} );
				},
			},
			quicktags: true,
			mediaButtons: true,
		} );

		const textarea = textareaRef.current;
		const handleTextareaInput = () => onChangeRef.current( textarea.value );
		textarea?.addEventListener( 'input', handleTextareaInput );

		return () => {
			textarea?.removeEventListener( 'input', handleTextareaInput );
			// `wp.editor.remove()` -- not just letting the DOM node get
			// garbage-collected -- is what actually tears down TinyMCE's
			// own iframe/toolbar and unregisters it from WP's own
			// editor registry; skipping this leaks an instance every
			// time a field closes (e.g. the Edit modal) and reopens.
			window.wp.editor.remove( editorId );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- runs
		// once per mount only, same reasoning as the onChangeRef split
		// above: re-running this for every value/onChange change would
		// tear down and rebuild the whole editor (losing undo history,
		// scroll position, ...) on every keystroke, not just when this
		// field's own identity actually changes.
	}, [] );

	if ( unavailable ) {
		return (
			<textarea
				id={ editorId }
				className="regular-text"
				rows={ 8 }
				defaultValue={ value || '' }
				onChange={ ( event ) => onChange( event.target.value ) }
			/>
		);
	}

	return (
		<textarea
			id={ editorId }
			ref={ textareaRef }
			className="regular-text gateway-wysiwyg-textarea"
			rows={ 8 }
			defaultValue={ value || '' }
		/>
	);
}
