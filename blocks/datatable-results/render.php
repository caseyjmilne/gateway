<?php
/**
 * Server-side render for the gateway/datatable-results block.
 *
 * A dedicated "Showing X to Y of Z entries" summary for a Data Table
 * block's grid -- an empty skeleton here, fully populated by
 * src/view.js once the sibling table's DataTable instance exists, for the
 * same reason gateway/pagination's skeleton is empty: the actual counts
 * depend on DataTables' own client-side paging/filtering state, which can
 * also shift as live gateway/facet filters are applied, neither of which
 * is knowable at server-render time.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-results' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-live="polite"></div>
