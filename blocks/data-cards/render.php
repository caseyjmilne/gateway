<?php
/**
 * Server-side render for the gateway/data-cards block.
 *
 * Unlike gateway/datatable's own render.php (a pure "find each named child
 * and echo it" dispatcher, with all real work delegated to the one child
 * that needs it -- gateway/datatable-body), THIS parent does the real
 * work itself: running the WP_Query, rendering the card template per
 * post, and computing pager metadata, all ONCE, right here -- then hands
 * that one computed result to Header/Body/Footer via
 * Data_Cards_Renderer::set_current() before dispatching them, and clears
 * it immediately after.
 *
 * Why here and not in gateway/data-cards-body/render.php (which is where
 * the equivalent work lives for the table family): THREE of this family's
 * children need the same query result -- Body (the grid itself), and
 * Pagination/Results (nested under Footer, needing the real page/pager
 * counts to render real initial state instead of an empty skeleton, per
 * this family's whole point -- see Data_Cards_Renderer's own docblock).
 * Those are independently-dispatched SIBLING blocks; WordPress block
 * context only flows from ancestor to descendant, never sideways between
 * them, and re-running the same WP_Query redundantly in each of their own
 * render.php calls would defeat that "real initial state" goal at the
 * cost of the query, not save it. The one common ancestor -- this block --
 * is the only place that can compute it once and hand it to all three.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: postType, limit, pageSize, facets.
 * @var string   $content    Unused -- see gateway/datatable/render.php's
 *                            own docblock for why (four named zones can't
 *                            be represented by one flat concatenated string).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$post_type = sanitize_key( $attributes['postType'] ?? 'post' );

if ( ! post_type_exists( $post_type ) ) {
	$post_type = 'post';
}

$limit     = absint( $attributes['limit'] ?? 0 );
$page_size = max( 1, absint( $attributes['pageSize'] ?? 12 ) );

// Find the gateway/data-cards-body child to read its own authored template
// (its innerBlocks -- arbitrary user-authored content) directly off the
// already-instantiated WP_Block, the same public property gateway/
// datatable/render.php's own docblock already confirms against WordPress
// core's WP_Block source.
$body_block = null;

foreach ( $block->inner_blocks as $inner_block ) {
	if ( 'gateway/data-cards-body' === $inner_block->name ) {
		$body_block = $inner_block;
		break;
	}
}

$template_blocks = $body_block && ! empty( $body_block->parsed_block['innerBlocks'] )
	? $body_block->parsed_block['innerBlocks']
	: array();

// Resolve + validate this block's own configured facets (its Facets
// panel, mirroring gateway/datatable's own) the same defensive way
// gateway/datatable-body/render.php validates its own -- a key not
// currently isFilterable for this post type is dropped, never trusted
// from the attribute. Default values take effect right here, on the
// always-fresh initial query -- a visitor's own live changes are a
// separate, later concern (Data_Cards_REST_Controller).
$available_columns = array();

foreach ( \Gateway\Column_Registry::get_columns( $post_type ) as $available_column ) {
	$available_columns[ $available_column['key'] ] = $available_column;
}

$raw_facets = $attributes['facets'] ?? array();
$facets     = is_array( $raw_facets ) ? \Gateway\Facet_Query::validate_facets( $raw_facets, $available_columns ) : array();

// Page 0 (zero-based, see Data_Cards_Renderer's own docblock), no search --
// the always-fresh state for a real, full-page render. Later pages/searches
// are fetched by the front end via Data_Cards_REST_Controller.
$query_args = \Gateway\Data_Cards_Renderer::get_query_args( $post_type, 0, $page_size, '' );
$query_args = \Gateway\Facet_Query::apply_facets( $query_args, $facets );
$query      = new WP_Query( $query_args );

$html       = \Gateway\Data_Cards_Renderer::render_items( $query, $template_blocks, $limit, 0, $page_size );
$pager_meta = \Gateway\Data_Cards_Renderer::build_pager_meta( $query, 0, $page_size, $limit );

// A short-lived, content-addressed transient is how the front end can ask
// Data_Cards_REST_Controller for page 2, 3, ... of THIS template later,
// without ever handing the client the template markup itself to send back
// -- see that controller's own docblock for why that distinction is a
// real security boundary, not just a convenience. Refreshed on every full
// page render, so it only goes stale if this page hasn't been visited in
// over an hour (Data_Cards_REST_Controller then returns 410, and the
// front end reloads -- see shared/cards.js's handleCardsFetchError()).
$serialized_template = serialize_blocks( $template_blocks );
$template_id          = substr( md5( $serialized_template . '|' . $post_type ), 0, 20 );
set_transient( 'gwdc_tpl_' . $template_id, $serialized_template, HOUR_IN_SECONDS );

\Gateway\Data_Cards_Renderer::set_current(
	array_merge(
		array(
			'html'        => $html,
			'template_id' => $template_id,
			'rest_url'    => rest_url( 'gateway/v1/data-cards/' . $post_type ),
			'post_type'   => $post_type,
			'page_size'   => $page_size,
			'limit'       => $limit,
		),
		$pager_meta
	)
);

$markup_by_name = array(
	'gateway/data-cards-header' => '',
	'gateway/data-cards-body'   => '',
	'gateway/data-cards-footer' => '',
);

// gateway/card-facet is allowed THREE places (its own block.json's
// "parent"): the dedicated gateway/data-cards-facets zone (falls under
// the $markup_by_name lookup above like any other named zone), OR loose,
// directly here as a sibling of the four zones -- which $markup_by_name's
// fixed-key lookup alone can't render, since it isn't one of those four
// names. Collected separately and rendered right after the Facets zone,
// regardless of where among the other zones it actually sits in the
// editor's own InnerBlocks list -- simpler and more predictable than
// trying to preserve its exact interleaved position.
$facets_zone_markup  = '';
$loose_facets_markup = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( 'gateway/data-cards-facets' === $inner_block->name ) {
		$facets_zone_markup .= $inner_block->render();
	} elseif ( 'gateway/card-facet' === $inner_block->name ) {
		$loose_facets_markup .= $inner_block->render();
	} elseif ( isset( $markup_by_name[ $inner_block->name ] ) ) {
		$markup_by_name[ $inner_block->name ] .= $inner_block->render();
	}
}

// Never left set for a later, unrelated gateway/data-cards instance (or a
// nested Query Loop re-render, or anything else) to accidentally read.
\Gateway\Data_Cards_Renderer::clear_current();

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-block' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $facets_zone_markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- gateway/data-cards-facets' own escaped output ('' if absent/empty). ?>
	<?php echo $loose_facets_markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each loose gateway/card-facet child's own escaped output. ?>
	<?php foreach ( $markup_by_name as $markup ) : ?>
		<?php if ( '' !== $markup ) : ?>
			<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each named child's own escaped output. ?>
		<?php endif; ?>
	<?php endforeach; ?>
</div>
