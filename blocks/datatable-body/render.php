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
			array( 'sortable' => ! empty( $requested_column['sortable'] ) )
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

// TEMPORARY diagnostic -- remove once the sortable-columns report is
// resolved. Shows exactly what this render actually resolved $columns to
// (including 'sortable'), viewable via "Inspect"/"View Source" on the
// rendered table, so we can see whether $raw_columns itself already had
// the wrong 'sortable' value reaching render.php, or whether it's correct
// here and something *else* is the problem.
echo "\n<!-- Gateway debug: resolved columns = " . esc_html( wp_json_encode( $columns ) ) . " -->\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped

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
						<td data-filter="<?php echo esc_attr( \Gateway\Column_Registry::get_cell_filter_value( $post_id, $column ) ); ?>">
							<?php if ( 'post_title' === $column['key'] ) : ?>
								<a href="<?php echo esc_url( get_permalink( $post_id ) ); ?>">
									<?php echo esc_html( \Gateway\Column_Registry::get_cell_value( $post_id, $column ) ); ?>
								</a>
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
