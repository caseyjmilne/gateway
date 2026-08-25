<?php
/**
 * Server-side render for the gateway/datatable block.
 *
 * This is what powers both the front-end output *and* the editor preview
 * (the editor uses <ServerSideRender>, which calls this exact same render
 * path through the block-renderer REST endpoint) -- so the grid a user sees
 * while editing is always the real markup, not a JS-side approximation.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Server-rendered inner blocks (gateway/facet children), output above the table.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$post_type = isset( $attributes['postType'] ) ? sanitize_key( $attributes['postType'] ) : 'post';

if ( ! post_type_exists( $post_type ) ) {
	$post_type = 'post';
}

// 0 (or anything not a positive integer) means "no limit".
$limit = isset( $attributes['limit'] ) ? absint( $attributes['limit'] ) : 0;

// Rows shown per page in the grid (DataTables' pageLength, read from the
// data-page-size attribute below). Falls back to DataTables' own default
// (10) for anything that isn't a positive integer.
$page_size = isset( $attributes['pageSize'] ) ? absint( $attributes['pageSize'] ) : 10;

// Resolve the requested columns against Column_Registry -- this is the
// validation step: a column key that isn't a real, known column for this
// post type (stale attribute from a since-changed post type, hand-edited
// post content, etc.) is silently dropped rather than trusted.
$available_columns = array();

foreach ( \Gateway\Column_Registry::get_columns( $post_type ) as $available_column ) {
	$available_columns[ $available_column['key'] ] = $available_column;
}

$columns = array();

if ( ! empty( $attributes['columns'] ) && is_array( $attributes['columns'] ) ) {
	foreach ( $attributes['columns'] as $requested_column ) {
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

// Resolve + validate the requested facets the same way as columns: a key
// not in $available_columns for this post type is dropped, and each valid
// facet's 'type' (core|meta|taxonomy) is taken from Column_Registry, never
// trusted from the attribute, since Facet_Query routes each type very
// differently (a mislabeled facet could otherwise dodge the SQL-safety
// allow-list core facets go through).
$facets = array();

if ( ! empty( $attributes['facets'] ) && is_array( $attributes['facets'] ) ) {
	foreach ( $attributes['facets'] as $requested_facet ) {
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
 * Filters the WP_Query arguments used to populate the datatable block.
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

$table_id           = 'gateway-datatable-' . wp_unique_id();
$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-block' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php if ( ! empty( $content ) ) : ?>
		<?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- already-rendered inner block markup (save.js's wrapper div + each gateway/facet child's own escaped output). ?>
	<?php endif; ?>
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
							<td>
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
</div>
