<?php
/**
 * Server-side render for the gateway/datatable-body block.
 *
 * Builds the actual `<table>` -- headings and rows -- for the parent
 * gateway/datatable block. This used to live directly in gateway/datatable's
 * own render.php; it moved here so the table is a genuine sibling of
 * gateway/datatable-header and gateway/datatable-footer in ONE ordered
 * InnerBlocks list, rather than a separately-positioned <ServerSideRender>
 * preview bolted on below that list -- which is what previously made the
 * editor's visual order (Header, Footer, *then* the table preview) diverge
 * from the front end's real order (Header, table, Footer). Now the editor's
 * InnerBlocks list itself is Header, Body, Footer, in that order, matching
 * the front end exactly, by construction.
 *
 * Settings (postType/limit/pageSize/columns/facets) come from
 * gateway/datatable's context on every *real* render -- front end or a full
 * page load -- since context resolves normally there. The one place it
 * doesn't is this block's own editor preview: <ServerSideRender> only ever
 * sends a block's own top-level *attributes* to the block-renderer REST
 * endpoint, never inherited context, so `$block->context` is empty in that
 * specific case. `src/edit.js` works around exactly that gap by mirroring
 * context into this block's own (otherwise-unused) attributes whenever it
 * changes, so there's always a same-shaped fallback to read from. Real
 * renders always prefer context -- the mirrored attributes could only ever
 * be stale copies of it.
 *
 * @package Gateway
 *
 * @var array    $attributes Mirrored postType/limit/pageSize/columns/facets -- SSR-preview fallback only, see above.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/datatable.
 */

defined( 'ABSPATH' ) || exit;

$context = $block->context;

$post_type = isset( $context['gateway/datatable/postType'] )
	? $context['gateway/datatable/postType']
	: ( $attributes['postType'] ?? 'post' );
$post_type = sanitize_key( $post_type );

if ( ! post_type_exists( $post_type ) ) {
	$post_type = 'post';
}

$raw_limit = $context['gateway/datatable/limit'] ?? ( $attributes['limit'] ?? 0 );
// 0 (or anything not a positive integer) means "no limit".
$limit = absint( $raw_limit );

$raw_page_size = $context['gateway/datatable/pageSize'] ?? ( $attributes['pageSize'] ?? 10 );
// Rows shown per page in the grid (DataTables' pageLength, read from the
// data-page-size attribute below). Falls back to DataTables' own default
// (10) for anything that isn't a positive integer.
$page_size = absint( $raw_page_size );

$raw_columns = $context['gateway/datatable/columns'] ?? ( $attributes['columns'] ?? array() );
$raw_facets  = $context['gateway/datatable/facets'] ?? ( $attributes['facets'] ?? array() );

// Resolve the requested columns against Column_Registry -- this is the
// validation step: a column key that isn't a real, known column for this
// post type (stale attribute from a since-changed post type, hand-edited
// post content, etc.) is silently dropped rather than trusted.
$available_columns = array();

foreach ( \Gateway\Column_Registry::get_columns( $post_type ) as $available_column ) {
	$available_columns[ $available_column['key'] ] = $available_column;
}

$columns = array();

if ( ! empty( $raw_columns ) && is_array( $raw_columns ) ) {
	foreach ( $raw_columns as $requested_column ) {
		if ( empty( $requested_column['key'] ) ) {
			continue;
		}

		// Not sanitize_key(): it forces lowercase, which would corrupt the
		// core "ID" column key. The real validation here is the allow-list
		// lookup below -- any key not already known to Column_Registry for
		// this post type is dropped, regardless of casing.
		$key = is_string( $requested_column['key'] ) ? trim( $requested_column['key'] ) : '';

		if ( '' === $key || ! isset( $available_columns[ $key ] ) || isset( $columns[ $key ] ) ) {
			continue;
		}

		$columns[ $key ] = array_merge(
			$available_columns[ $key ],
			// Not `! empty( $requested_column['sortable'] )`: on every real
			// render (front end, or a full page load) this is a genuine PHP
			// boolean, straight from parse_blocks()'s JSON decoding, and
			// `! empty()` works fine on that. But `gateway/datatable-body`'s
			// own editor preview (edit.js) arrives via <ServerSideRender>,
			// which -- with no explicit `httpMethod="POST"` -- sends
			// `attributes` as GET *query string* parameters
			// (`@wordpress/server-side-render`'s own default, confirmed
			// against its source: `addQueryArgs( path, { attributes, ... } )`).
			// Query strings have no boolean type -- `sortable: false` becomes
			// the literal text "false" on the wire, and PHP's `empty( "false"
			// )` is `false` (a non-empty string), making `! empty( "false" )`
			// evaluate to `true` -- silently flipping every non-sortable
			// column back to sortable, but only for requests that went
			// through a query string. `rest_sanitize_boolean()` (WordPress
			// core, `wp-includes/rest-api.php`) is built for exactly this:
			// unlike `! empty()`, it specifically treats the strings "false"
			// and "0" as `false` before falling back to a normal boolean
			// cast, so it produces the correct result whether `sortable`
			// arrived as a real boolean (front end) or its query-string
			// stringified form (editor preview).
			array( 'sortable' => rest_sanitize_boolean( $requested_column['sortable'] ?? false ) )
		);
	}
}

// Every configured column turned out to be invalid for this post type (or
// none were configured) -- fall back to the same default the block starts
// with, so the grid never renders with zero columns.
if ( empty( $columns ) ) {
	foreach ( array( 'ID', 'post_title' ) as $key ) {
		if ( isset( $available_columns[ $key ] ) ) {
			$columns[ $key ] = array_merge( $available_columns[ $key ], array( 'sortable' => true ) );
		}
	}
}

$columns = array_values( $columns );

// Resolve + validate the requested facets the same way as columns: a key
// not in $available_columns for this post type is dropped, and each valid
// facet's 'type' (core|meta|taxonomy) is taken from Column_Registry, never
// trusted from the attribute, since Facet_Query routes each type very
// differently (a mislabeled facet could otherwise dodge the SQL-safety
// allow-list core facets go through).
$facets = array();

if ( ! empty( $raw_facets ) && is_array( $raw_facets ) ) {
	foreach ( $raw_facets as $requested_facet ) {
		if ( empty( $requested_facet['key'] ) ) {
			continue;
		}

		$key = is_string( $requested_facet['key'] ) ? trim( $requested_facet['key'] ) : '';

		if ( '' === $key || ! isset( $available_columns[ $key ] ) ) {
			continue;
		}

		$value = isset( $requested_facet['value'] ) ? (string) $requested_facet['value'] : '';

		// An incomplete facet (no value entered yet) filters nothing --
		// skip it rather than querying for an empty value.
		if ( '' === $value ) {
			continue;
		}

		$facets[] = array(
			'key'     => $key,
			'type'    => $available_columns[ $key ]['type'],
			'compare' => isset( $requested_facet['compare'] ) ? $requested_facet['compare'] : '=',
			'value'   => $value,
		);
	}
}

$query_args = array(
	'post_type'      => $post_type,
	'post_status'    => 'publish',
	'orderby'        => 'ID',
	'order'          => 'DESC',
	'posts_per_page' => $limit > 0 ? $limit : -1,
	'no_found_rows'  => true,
);

$query_args = \Gateway\Facet_Query::apply_facets( $query_args, $facets );

/**
 * Filters the WP_Query arguments used to populate the datatable block's body.
 *
 * DataTables handles paging/sorting/filtering client-side, so by default (or
 * when the block's Limit setting is 0) we fetch every published item for the
 * chosen post type. Sites with very large post types can use this filter to
 * cap posts_per_page or otherwise narrow the query regardless of the block's
 * own Limit setting.
 *
 * @param array    $query_args WP_Query arguments.
 * @param array    $attributes Block attributes.
 * @param WP_Block $block      Block instance.
 */
$query_args = apply_filters( 'gateway_datatable_query_args', $query_args, $attributes, $block );

$query = new WP_Query( $query_args );

$table_id = 'gateway-datatable-' . wp_unique_id();
?>
<?php if ( $query->have_posts() ) : ?>
	<table
		id="<?php echo esc_attr( $table_id ); ?>"
		class="gateway-datatable display"
		data-post-type="<?php echo esc_attr( $post_type ); ?>"
		data-page-size="<?php echo esc_attr( $page_size ); ?>"
		style="width:100%"
	>
		<thead>
			<tr>
				<?php foreach ( $columns as $column ) : ?>
					<th
						data-orderable="<?php echo $column['sortable'] ? 'true' : 'false'; ?>"
						data-column-key="<?php echo esc_attr( $column['key'] ); ?>"
					>
						<?php echo esc_html( $column['label'] ); ?>
					</th>
				<?php endforeach; ?>
			</tr>
		</thead>
		<tbody>
			<?php
			while ( $query->have_posts() ) :
				$query->the_post();
				$post_id = get_the_ID();
				?>
				<tr>
					<?php foreach ( $columns as $column ) : ?>
						<td
							data-filter="<?php echo esc_attr( \Gateway\Column_Registry::get_cell_filter_value( $post_id, $column ) ); ?>"
							<?php if ( 'thumbnail' === $column['type'] ) : ?>
								<?php // No text content to sort by (it's an <img>, not a string) -- DataTables reads this attribute over the cell's own content when present, giving it a stable, real sort key (the attachment ID) instead of treating every row as equal. ?>
								data-order="<?php echo (int) get_post_thumbnail_id( $post_id ); ?>"
							<?php endif; ?>
						>
							<?php if ( 'post_title' === $column['key'] ) : ?>
								<a href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">
									<?php echo esc_html( \Gateway\Column_Registry::get_cell_value( $post_id, $column ) ); ?>
								</a>
							<?php elseif ( 'thumbnail' === $column['type'] ) : ?>
								<?php echo \Gateway\Column_Registry::get_cell_value( $post_id, $column ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_the_post_thumbnail()'s own already-escaped <img> markup; esc_html() here would print it as literal text instead of rendering the image. ?>
							<?php else : ?>
								<?php echo esc_html( \Gateway\Column_Registry::get_cell_value( $post_id, $column ) ); ?>
							<?php endif; ?>
						</td>
					<?php endforeach; ?>
				</tr>
				<?php
			endwhile;
			wp_reset_postdata();
			?>
		</tbody>
	</table>
<?php else : ?>
	<p>
		<?php
		printf(
			/* translators: %s: post type label. */
			esc_html__( 'No published %s found.', 'gateway' ),
			esc_html( get_post_type_object( $post_type )->labels->name ?? $post_type )
		);
		?>
	</p>
<?php endif; ?>
