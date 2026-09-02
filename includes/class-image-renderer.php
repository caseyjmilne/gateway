<?php
/**
 * Turns a Gateway Image field's own raw stored value (always a bare WP
 * attachment id in the database, regardless of the field's configured
 * `return_format` -- that setting only ever shapes what a REST
 * *consumer* sees, per `Records_REST_Controller::resolve_image_value()`'s
 * own docblock) into real, ready-to-print `<img>` markup for
 * `gateway/card-field-image/render.php` -- the same "one shared class,
 * not duplicated per-render.php logic" shape `Number_Formatter` already
 * has for `gateway/card-field-number`.
 *
 * Deliberately does NOT reuse `resolve_image_value()` itself: that
 * method builds the REST API's own enriched *data* shape (id/url/alt/
 * width/height/sizes, for a JS consumer to read fields off of), where
 * this only ever needs to produce a finished HTML string for a single,
 * already-known size -- reimplementing the (much smaller) "id + format +
 * size -> markup" question directly, via WordPress core's own
 * `wp_get_attachment_image()`, is both simpler and gets a real `<img>`
 * with `srcset`/`sizes`/lazy-loading/width/height attributes for free,
 * none of which `resolve_image_value()`'s own plain data shape carries.
 *
 * A pure static helper, not a hook-owning service -- nothing here needs
 * to run on its own, so it has no init() and gateway.php only ever
 * require_once's it, the same shape `Number_Formatter`/
 * `Data_Cards_Renderer` already have.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Image_Renderer {

	/**
	 * @param mixed  $attachment_id Raw stored value -- expected to be a
	 *                               real WP attachment post id (or
	 *                               already an int/numeric string), but
	 *                               never trusted outright: null, blank,
	 *                               non-numeric, or naming a post that no
	 *                               longer exists all resolve to ''.
	 * @param string $return_format One of 'array'/'url'/'id' -- the
	 *                               field's own configured Return
	 *                               Format (`Column_Registry::
	 *                               get_columns_for_collection()`'s own
	 *                               `returnFormat`). Decides which of the
	 *                               two branches below runs; anything
	 *                               other than the literal string 'url'
	 *                               is treated as the richer branch (a
	 *                               field newly retyped, or a genuinely
	 *                               unrecognized value some future code
	 *                               path passes in, degrades to the MORE
	 *                               capable behavior, not silently to no
	 *                               image at all).
	 * @param string $size          A registered image size name (or
	 *                               'full') -- only actually consulted
	 *                               for the 'array'/'id' branch; see this
	 *                               class's own docblock for why 'url' has
	 *                               no size to resolve at all.
	 * @param array  $extra_attrs   Extra HTML attributes merged into the
	 *                               `<img>` tag -- passed straight through
	 *                               to `wp_get_attachment_image()`'s own
	 *                               `$attr` parameter for the 'array'/'id'
	 *                               branch; applied by hand for the 'url'
	 *                               branch's own plain, hand-built tag.
	 * @return string Ready-to-print `<img>` markup (already escaped), or
	 *                 '' if there's genuinely nothing to render -- no
	 *                 stray broken-image tag for a record whose Image
	 *                 field was never filled in, or whose attachment has
	 *                 since been deleted.
	 */
	public static function render( $attachment_id, $return_format, $size = 'full', array $extra_attrs = array() ) {
		if ( empty( $attachment_id ) || ! is_numeric( $attachment_id ) || ! get_post( (int) $attachment_id ) ) {
			return '';
		}

		$attachment_id = (int) $attachment_id;

		if ( 'url' === $return_format ) {
			// Deliberately restricted to a plain, hand-built tag even
			// though the real attachment id (and therefore every
			// registered size) is technically still available at this
			// point -- honoring the field's own configured contract
			// uniformly, the same "like ACF" Return Format convention
			// the site owner already relies on elsewhere (RecordForm's
			// own picker, the REST API), rather than this one consumer
			// quietly ignoring it because it happens to have more to
			// work with. A field configured this way is meant to behave
			// as "just a URL" everywhere it's used.
			$url = wp_get_attachment_url( $attachment_id );

			if ( ! $url ) {
				return '';
			}

			$alt = get_post_meta( $attachment_id, '_wp_attachment_image_alt', true );
			$attr_string = '';

			foreach ( $extra_attrs as $attr_name => $attr_value ) {
				$attr_string .= sprintf( ' %s="%s"', esc_attr( $attr_name ), esc_attr( $attr_value ) );
			}

			return sprintf(
				'<img src="%s" alt="%s"%s />',
				esc_url( $url ),
				esc_attr( $alt ),
				$attr_string // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each attribute's own name/value already escaped above.
			);
		}

		// 'array' and 'id' are both backed by the exact same real
		// attachment id regardless of which shape a REST consumer would
		// see -- either can resolve ANY registered size, so both take
		// this same, richer path: a real wp_get_attachment_image() call,
		// with its own srcset/sizes/width/height/loading attributes,
		// rather than a hand-built tag.
		return (string) wp_get_attachment_image( $attachment_id, $size, false, $extra_attrs );
	}

	/**
	 * Resolves gateway/card-field-image's own "Link To" setting to a
	 * real href, or '' if there's nothing to link to -- the same "one
	 * shared class, not duplicated per-render.php logic" reasoning this
	 * class's own docblock already gives for `render()` itself, and the
	 * PHP counterpart of `core/image`'s own Media File/Attachment Page/
	 * Custom URL link destinations.
	 *
	 * Works identically regardless of the field's own configured Return
	 * Format, unlike `render()`'s own `$size` parameter (which 'url'
	 * can't support at all -- see this class's own docblock): none of
	 * these three destinations need anything from WP's own registered
	 * -size system, only the plain, real attachment id every Return
	 * Format resolves to underneath (`Column_Registry::resolve_collection_value()`
	 * always returns the bare id, regardless of `return_format` -- see
	 * gateway/card-field-image/render.php's own docblock).
	 *
	 * @param int    $attachment_id     A real, already-confirmed-to-exist
	 *                                   attachment id -- by the time this
	 *                                   is ever worth calling, `render()`
	 *                                   above has already returned real
	 *                                   markup for it, so this never
	 *                                   independently re-checks existence.
	 * @param string $link_destination  One of 'none'/'media'/'attachment'/
	 *                                   'custom' -- anything else is
	 *                                   treated the same as 'none'.
	 * @param string $custom_href       The block's own configured custom
	 *                                   URL -- only consulted when
	 *                                   `$link_destination` is 'custom'.
	 * @return string A real href, or '' for 'none', an unrecognized
	 *                 destination, an empty custom URL, or a destination
	 *                 that genuinely failed to resolve (e.g.
	 *                 `get_permalink()` returning `false`).
	 */
	public static function resolve_link_href( $attachment_id, $link_destination, $custom_href = '' ) {
		switch ( $link_destination ) {
			case 'media':
				$url = wp_get_attachment_url( (int) $attachment_id );
				return $url ? (string) $url : '';
			case 'attachment':
				$url = get_permalink( (int) $attachment_id );
				return $url ? (string) $url : '';
			case 'custom':
				return is_string( $custom_href ) ? trim( $custom_href ) : '';
			default:
				return '';
		}
	}
}
