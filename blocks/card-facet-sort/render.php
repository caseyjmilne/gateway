<?php
/**
 * Server-side render for the gateway/card-facet-sort block.
 *
 * A self-contained facet-family block (ancestor: gateway/data-cards, like
 * gateway/card-facet-search/-has-value/-text) rather than a fixed slot --
 * a single `<select>` listing every currently orderable field TWICE, once
 * per direction ("Title (Ascending)", "Title (Descending)", ...), per a
 * direct request: "a single select that defaults to whatever the default
 * sort is... list every sort field twice." No `fieldKey`-style attribute
 * at all -- like gateway/card-facet-search, there's nothing to configure;
 * every orderable field is offered, always.
 *
 * "Ascending"/"Descending" (not ASC/DESC, not an abbreviation) reuses
 * this plugin's own EXISTING exact wording from the site-owner-facing
 * Order control (blocks/shared/controls/order-control.js's own
 * ORDER_OPTIONS) -- a site owner who already knows those words from that
 * panel sees the identical ones here.
 *
 * Real field data, unlike gateway/card-facet-search's own render.php
 * (which has nothing to look up) -- computed the same way gateway/
 * card-field-text/gateway/card-facet's own render.php files already
 * compute their own field lists, straight off Column_Registry.
 *
 * The `selected` option here is DISPLAY-ONLY: it never gets written back
 * into any attribute. gateway/data-cards-body's own grid already carries
 * `data-order-by`/`data-order` (the block's raw, possibly-empty
 * orderBy/order attributes -- see that block's own render.php), and
 * Data_Cards_REST_Controller already re-resolves an empty value into the
 * exact same real default on every subsequent fetch this block's own
 * view.js doesn't trigger -- so there's nothing to keep in sync. This
 * file only needs to know the REAL resolved default well enough to mark
 * the matching `<option>` as already selected on first paint.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/data-cards.
 */

defined( 'ABSPATH' ) || exit;

$source_type = isset( $block->context['gateway/data-cards/sourceType'] ) && 'collection' === $block->context['gateway/data-cards/sourceType']
	? 'collection'
	: 'postType';

$post_type = isset( $block->context['gateway/data-cards/postType'] )
	? sanitize_key( $block->context['gateway/data-cards/postType'] )
	: '';

$collection = isset( $block->context['gateway/data-cards/collection'] ) && is_string( $block->context['gateway/data-cards/collection'] )
	? $block->context['gateway/data-cards/collection']
	: '';

$order_by = isset( $block->context['gateway/data-cards/orderBy'] ) && is_string( $block->context['gateway/data-cards/orderBy'] )
	? trim( $block->context['gateway/data-cards/orderBy'] )
	: '';

$order = isset( $block->context['gateway/data-cards/order'] ) && is_string( $block->context['gateway/data-cards/order'] )
	? strtolower( trim( $block->context['gateway/data-cards/order'] ) )
	: '';

$has_source = 'collection' === $source_type ? '' !== $collection : '' !== $post_type;

if ( ! $has_source ) {
	return; // No Model/post type chosen yet -- nothing to offer.
}

$columns = 'collection' === $source_type
	? \Gateway\Column_Registry::get_columns_for_collection( $collection )
	: \Gateway\Column_Registry::get_columns( $post_type );

$orderable_columns = array_values(
	array_filter(
		$columns,
		function ( $column ) {
			return ! empty( $column['isOrderable'] );
		}
	)
);

if ( empty( $orderable_columns ) ) {
	return; // Nothing sortable at all -- render nothing, same as an empty gateway/card-facet-search would have nothing to search.
}

// The real, currently-active default -- for pre-selecting the matching
// `<option>` only, see this file's own docblock above.
if ( 'collection' === $source_type ) {
	$resolved_field = \Gateway\Model_Fields::resolve_orderby( $collection, $order_by );
} else {
	// Column_Registry::resolve_post_orderby() returns a WP_Query orderby
	// TOKEN ('title'), not the property-name KEY ('post_title') this
	// facet's own option values (and the block's own orderBy attribute)
	// use -- so this checks validity directly against the same allow-list
	// that method itself re-validates against, rather than reusing its
	// return value for a purpose it isn't shaped for.
	$resolved_field = ( '' !== $order_by && array_key_exists( $order_by, \Gateway\Column_Registry::ORDERABLE_CORE_COLUMNS ) )
		? $order_by
		: 'post_date';
}

// Matches blocks/data-cards/render.php's/Data_Cards_Renderer::get_collection_page()'s
// own identical normalization: anything other than an explicit 'asc'
// (including '') resolves to 'desc'.
$resolved_order = 'asc' === $order ? 'asc' : 'desc';

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-facet-sort' ) );
$field_id            = 'gateway-card-facet-sort-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet-sort__label">
		<?php esc_html_e( 'Sort by:', 'gateway' ); ?>
	</label>
	<select id="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet-sort__select">
		<?php foreach ( $orderable_columns as $column ) : ?>
			<option
				value="<?php echo esc_attr( $column['key'] . ':asc' ); ?>"
				<?php selected( $column['key'] === $resolved_field && 'asc' === $resolved_order ); ?>
			>
				<?php
				echo esc_html(
					sprintf(
						/* translators: %s: field label. */
						__( '%s (Ascending)', 'gateway' ),
						$column['label']
					)
				);
				?>
			</option>
			<option
				value="<?php echo esc_attr( $column['key'] . ':desc' ); ?>"
				<?php selected( $column['key'] === $resolved_field && 'desc' === $resolved_order ); ?>
			>
				<?php
				echo esc_html(
					sprintf(
						/* translators: %s: field label. */
						__( '%s (Descending)', 'gateway' ),
						$column['label']
					)
				);
				?>
			</option>
		<?php endforeach; ?>
	</select>
</div>
