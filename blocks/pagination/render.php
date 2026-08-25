<?php
/**
 * Server-side render for the gateway/pagination block.
 *
 * A dedicated "pagination area" for a Data Table block: renders an empty
 * skeleton -- Previous/Next buttons plus an (initially empty) container for
 * page-number buttons -- that blocks/pagination/src/view.js fully populates
 * once the sibling table's DataTable instance exists. The actual page count
 * depends on DataTables' own client-side paging/filtering state (which can
 * also shift as live gateway/facet filters are applied), not anything
 * knowable at server-render time, so there's nothing more meaningful to
 * server-render here -- same reasoning as why gateway/facet's Select and
 * Checkboxes options are the only thing it renders server-side, while the
 * interactive wiring itself is entirely client-side.
 *
 * This block doesn't need any of the parent's context (postType/columns/
 * facets): unlike gateway/facet, it doesn't target a specific column, it
 * just drives the table's paging as a whole, found the same way gateway/
 * facet finds its table -- see shared/wait-for-datatable.js.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-pagination' ) );
?>
<nav <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-label="<?php esc_attr_e( 'Table pagination', 'gateway' ); ?>">
	<button type="button" class="gateway-pagination__prev" disabled>
		<?php esc_html_e( 'Previous', 'gateway' ); ?>
	</button>
	<span class="gateway-pagination__pages"></span>
	<button type="button" class="gateway-pagination__next" disabled>
		<?php esc_html_e( 'Next', 'gateway' ); ?>
	</button>
</nav>
