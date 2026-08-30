<?php
/**
 * Small, admin-only REST routes User_Field_Type's own admin-app UI
 * needs -- `UserPicker.jsx`'s close sibling of `Media_REST_Controller`
 * (for Image/File) and `Records_REST_Controller::search_records()` (for
 * Relate to One/Relate to Many), just pointed at `wp_users` instead of an
 * attachment or a Gateway model's own records table:
 *
 * - `GET /gateway/v1/users/search?q=&exclude=` -- searches this site's
 *   own registered WP users by login/email/display name (`get_users()`),
 *   returning just `{id, label}` pairs (`label` is `display_name`) --
 *   the same minimal shape `Records_REST_Controller::search_records()`
 *   already returns for a Relate field's own search, for the exact same
 *   reason: enough to render an option list, nothing a picker doesn't
 *   need. `exclude` (the currently-selected user's own id, if any) keeps
 *   an already-picked user out of its own search results while the
 *   search box is showing.
 *
 * - `GET /gateway/v1/users/<id>` -- one user's own `{id, label}` shape,
 *   found by id instead of a search term -- for `UserPicker.jsx`'s own
 *   preview when a field's `return_format` is `'id'`: the record's own
 *   value in that case is a bare integer, with nothing else to build a
 *   chip/preview from without this (the same "return_format 'id' has
 *   nothing else to build a preview from" gap `Media_REST_Controller::get_media()`
 *   already fills for Image/File's own `'id'` format).
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class User_REST_Controller {

	const NAMESPACE_   = 'gateway/v1';
	const SEARCH_LIMIT = 20;

	/**
	 * Hook route registration into WordPress.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * GET /gateway/v1/users/search
	 * GET /gateway/v1/users/<id>
	 *
	 * `/search` is registered BEFORE `/(?P<id>\d+)` -- WordPress tries
	 * routes in registration order, and although `\d+` alone could never
	 * actually match the literal string "search" (so the reverse order
	 * would work too), registering the more specific literal route first
	 * is the clearer, safer convention to read and to extend later.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE_,
			'/users/search',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'search_users' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_,
			'/users/(?P<id>\d+)',
			array(
				'methods'             => \WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'get_user' ),
				'permission_callback' => array( __CLASS__, 'permissions_check' ),
			)
		);
	}

	/**
	 * Same gate as the rest of the Models/Fields/Records admin API --
	 * `manage_options`, not something narrower like `list_users` --
	 * same "this is metadata for the Gateway admin screen itself, which
	 * is already only ever reached by a `manage_options` user" reasoning
	 * `Media_REST_Controller::permissions_check()`'s own docblock gives
	 * for its own identical choice.
	 *
	 * @return true|\WP_Error
	 */
	public static function permissions_check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new \WP_Error(
				'gateway_forbidden',
				__( 'You are not allowed to manage Gateway models.', 'gateway' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public static function search_users( \WP_REST_Request $request ) {
		$query_text  = trim( (string) $request->get_param( 'q' ) );
		$exclude_ids = array_filter( array_map( 'absint', explode( ',', (string) $request->get_param( 'exclude' ) ) ) );

		$args = array(
			'number'  => self::SEARCH_LIMIT,
			'orderby' => 'display_name',
			'order'   => 'ASC',
		);

		if ( $exclude_ids ) {
			$args['exclude'] = $exclude_ids;
		}

		if ( '' !== $query_text ) {
			// WP_User_Query's own `search` is an exact match unless
			// wrapped in wildcards -- '*text*' is what actually makes
			// this a "contains" search, the same convention
			// get_users()'s own docs describe. `search_columns` widens
			// the default (user_login/user_url/user_email/user_nicename)
			// to include `display_name` too -- a site owner searching
			// for a user overwhelmingly types the name they see in
			// wp-admin's own Users list, not a login/nicename that may
			// well differ from it.
			$args['search']         = '*' . $query_text . '*';
			$args['search_columns'] = array( 'user_login', 'user_email', 'display_name' );
		}

		$users = get_users( $args );

		return rest_ensure_response(
			array_map(
				function ( $user ) {
					return array(
						'id'    => $user->ID,
						'label' => $user->display_name,
					);
				},
				$users
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_user( \WP_REST_Request $request ) {
		$id   = (int) $request->get_param( 'id' );
		$user = get_userdata( $id );

		if ( ! $user ) {
			return new \WP_Error(
				'gateway_user_not_found',
				__( 'User not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return rest_ensure_response(
			array(
				'id'    => $id,
				'label' => $user->display_name,
			)
		);
	}
}
