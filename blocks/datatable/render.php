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
 * @var string   $content    Inner block content (unused -- this is a dynamic, leaf block for now).
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

$query_args = array(
	'post_type'      => $post_type,
	'post_status'    => 'publish',
	'orderby'        => 'ID',
	'order'          => 'DESC',
	'posts_per_page' => $limit > 0 ? $limit : -1,
	'no_found_rows'  => true,
);

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
					<th><?php esc_html_e( 'ID', 'gateway' ); ?></th>
					<th><?php esc_html_e( 'Title', 'gateway' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php
				while ( $query->have_posts() ) :
					$query->the_post();
					$title = get_the_title();
					?>
					<tr>
						<td><?php echo (int) get_the_ID(); ?></td>
						<td>
							<a href="<?php echo esc_url( get_permalink() ); ?>">
								<?php echo esc_html( '' !== $title ? $title : __( '(no title)', 'gateway' ) ); ?>
							</a>
						</td>
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
