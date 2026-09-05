<?php
/**
 * Turns a Gateway Markdown field's own raw stored value (plain Markdown
 * SOURCE text) into real, ready-to-print HTML for
 * `gateway/card-field-markdown/render.php` -- the same "one shared
 * class, not duplicated per-render.php logic" shape `Number_Formatter`/
 * `Image_Renderer` already have for their own field types.
 *
 * A thin wrapper around the vendored `league/commonmark` package (see
 * `vendor/README.md`), not a hand-rolled parser -- full CommonMark-spec
 * compliance (nested lists, reference links, fenced code blocks, ...) is
 * genuinely hard to get right, and this plugin's own "use a real,
 * battle-tested library instead of reimplementing one" precedent already
 * covers Eloquent/the Schema builder for exactly the same reason.
 *
 * A pure static helper, not a hook-owning service -- nothing here needs
 * to run on its own, so it has no init() and gateway.php only ever
 * require_once's it, the same shape `Number_Formatter`/`Image_Renderer`/
 * `Data_Cards_Renderer` already have.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Markdown_Converter {

	/**
	 * Lazily built, then reused for the rest of the request -- constructing
	 * a `CommonMarkConverter` does some real (if small) one-time setup work
	 * (building its own extension/parser/renderer environment), and a
	 * single page can easily render more than one Markdown field (multiple
	 * `gateway/card-field-markdown` instances across a Data Cards grid, or
	 * one per child in a Data Display), so this avoids repeating that setup
	 * once per field.
	 *
	 * @var \League\CommonMark\CommonMarkConverter|null
	 */
	private static $converter = null;

	/**
	 * Converts raw Markdown source into real HTML.
	 *
	 * Deliberately configured AWAY from `league/commonmark`'s own default
	 * (`html_input => 'allow'`, raw HTML embedded in the Markdown source
	 * passed straight through unescaped -- confirmed directly against the
	 * real package): a Markdown field's own value is genuinely
	 * `manage_options`-gated the same way `WYSIWYG_Field_Type`'s own
	 * trusted-HTML value already is (both are only ever written through
	 * `Records_REST_Controller`'s identical permission check), so passing
	 * raw embedded HTML through WOULD be defensible on that trust alone --
	 * but unlike WYSIWYG (whose whole point is entering HTML-shaped
	 * content via a rich-text UI), Markdown's own audience/tooling doesn't
	 * generally expect a stray `<script>` typed into Markdown source to
	 * ever execute. `'escape'` prints it back as visible, inert text
	 * instead of either executing it or silently dropping it -- the
	 * safer default costs nothing here, so there's no reason to lean on
	 * the trust argument alone. `allow_unsafe_links => false` similarly
	 * strips a `javascript:`-scheme link's own `href` outright (CommonMark's
	 * own built-in handling) rather than trusting every possible URL
	 * scheme a manage_options user could type into `[text](url)` syntax.
	 *
	 * @param string $markdown Raw Markdown source.
	 * @return string Real, ready-to-print HTML.
	 */
	public static function convert_to_html( $markdown ) {
		if ( '' === trim( (string) $markdown ) ) {
			return '';
		}

		if ( null === self::$converter ) {
			self::$converter = new \League\CommonMark\CommonMarkConverter( array(
				'html_input'         => 'escape',
				'allow_unsafe_links' => false,
			) );
		}

		return (string) self::$converter->convert( (string) $markdown );
	}
}
