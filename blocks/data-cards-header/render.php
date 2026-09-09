<?php
/**
 * Server-side render for the gateway/data-cards-header block.
 *
 * A single-slot InnerBlocks wrapper for the Data Cards' Page Size and
 * Search controls -- always rendered above the grid, by construction
 * (it's one of the places in the parent's InnerBlocks area gateway/
 * data-cards-page-size and gateway/card-facet-search are allowed to
 * live; see each one's own "parent"/"ancestor" restriction in its
 * block.json). gateway/card-facet is also allowed here (one of its own
 * allowed homes) -- included in $allowed_names below for the same
 * reason. Direct copy of gateway/datatable-header's own render.php,
 * renamed -- see that file's docblock for why $content is unused and
 * every child is filtered by name explicitly instead.
 *
 * gateway/data-cards-search used to be the search entry in
 * $allowed_names below -- removed entirely (see README.md's "One search
 * implementation, not two") once gateway/card-facet-search took over as
 * the single, shared search implementation. Forgetting to update this
 * list here specifically would have silently dropped a freshly-seeded
 * gateway/card-facet-search on the front end with zero output -- the
 * exact bug class already found once this session for gateway/facet
 * -has-value inside the (now also removed) datatable-facets container's
 * own render.php.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Unused -- see above.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$allowed_names = array( 'gateway/data-cards-page-size', 'gateway/card-facet-search', 'gateway/card-facet' );
$markup        = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( in_array( $inner_block->name, $allowed_names, true ) ) {
		$markup .= $inner_block->render();
	}
}

if ( '' === $markup ) {
	// Nothing (allowed) configured -- render nothing at all, not an empty
	// box, on the front end. (The editor still shows this block's own
	// frame regardless, per normal InnerBlocks editing UX -- see
	// style.scss's min-height.)
	return;
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-header' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each allowed child's own escaped output. ?>
</div>
