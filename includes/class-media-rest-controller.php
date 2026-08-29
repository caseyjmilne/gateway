<?php
/**
 * Two small, admin-only REST routes an Image field's own admin-app UI
 * needs that no other route already covers:
 *
 * - `GET /gateway/v1/image-sizes` -- every image size this site has
 *   registered (`wp_get_registered_image_sizes()`, core sizes and any
 *   `add_image_size()`'d by a theme/plugin alike) plus a synthetic "Full
 *   Size" entry -- what `FieldEditor.jsx`'s own Presentation tab builds
 *   an Image field's "Preview Size" `<select>` from, instead of a
 *   hardcoded guess at what sizes this particular site actually has.
 *
 * - `GET /gateway/v1/media/<id>` -- one attachment's own enriched shape
 *   (the exact same one `Records_REST_Controller::resolve_image_value()`
 *   builds for `return_format: 'array'`), for `RecordForm`'s own Image
 *   picker to render a real preview when a field's own `return_format`
 *   is `'id'` -- the record's own value in that case is a bare integer,
 *   with nothing else to build a thumbnail from without this.
 *
 * - `GET /gateway/v1/media-by-url?url=<url>` -- the same enriched shape,
 *   found by URL instead of id (`attachment_url_to_postid()`, a WP core
 *   function built for exactly this) -- for the SAME picker when a
 *   field's own `return_format` is `'url'` instead: the record's own
 *   value is then a bare URL string with no id in it at all, and
 *   `RecordForm` needs the real id back (not just a preview) so it can
 *   resubmit a valid value even for a record whose Image field is never
 *   actually touched during that edit -- see `ImagePicker.jsx`'s own
 *   docblock for the full "why" of this normalize-on-load step.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Media_REST_Controller {

	const NAMESPACE_ = 'gateway/v1';

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/image-sizes
	 * GET /gateway/v1/media/<id>
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/image-sizes',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'list_image_sizes' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/media/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_media' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/media-by-url',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_media_by_url' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
				'args'                => array(
					'url' => array(
						'required' => true,
						'type'     => 'string',
					),
				),
			)
		);
	}

	/**
	 * Same gate as the rest of the Models/Fields/Records admin API.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'upload_files' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage media.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function list_image_sizes() {
		$sizes = array();

		foreach ( wp_get_registered_image_sizes() as $name => $dimensions ) {
			$sizes[] = array(
				'key'   => $name,
				'label' => sprintf(
					/* translators: 1: image size name, e.g. "thumbnail", 2: width in pixels, 3: height in pixels */
					__( '%1$s (%2$d×%3$d)', 'gateway' ),
					ucwords( str_replace( array( '-', '_' ), ' ', $name ) ),
					$dimensions['width'],
					$dimensions['height']
				),
			);
		}

		// Not one of wp_get_registered_image_sizes()'s own entries --
		// "Full Size" (the original, unresized upload) is always
		// available regardless of what's registered, the same way ACF's
		// own Image field always offers it first.
		array_unshift(
			$sizes,
			array(
				'key'   => 'full',
				'label' => __( 'Full Size', 'gateway' ),
			)
		);

		return rest_ensure_response( $sizes );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_media( \WP_REST_Request $request ) {
		$id = (int) $request->get_param( 'id' );

		if ( ! get_post( $id ) || 'attachment' !== get_post_type( $id ) ) {
			return new \WP_Error(
				'gateway_media_not_found',
				__( 'Media item not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		// Always the full 'array' shape here, regardless of any field's
		// own configured return_format -- this route exists specifically
		// to give RecordForm's own Image picker something to build a
		// preview from when a field's OWN value is a bare id ('id'
		// format), so the shape it needs is always the rich one.
		return rest_ensure_response( Records_REST_Controller::resolve_image_value( $id, 'array' ) );
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_media_by_url( \WP_REST_Request $request ) {
		$id = attachment_url_to_postid( (string) $request->get_param( 'url' ) );

		if ( ! $id ) {
			return new \WP_Error(
				'gateway_media_not_found',
				__( 'No attachment found for that URL.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response( Records_REST_Controller::resolve_image_value( $id, 'array' ) );
	}
}
