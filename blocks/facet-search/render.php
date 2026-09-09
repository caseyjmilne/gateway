<?php
/**
 * Server-side render for the gateway/facet-search block.
 *
 * An optional, freely placeable duplicate of gateway/datatable-search's
 * own control -- same "DataTables' own global search, replacing its
 * default search box" behavior (src/view.js drives the exact same
 * `dataTable.search(value).draw()` call) -- but as a self-contained
 * facet-family block (ancestor: gateway/datatable, like gateway/facet
 * -has-value/-text) rather than a fixed slot inside gateway/datatable
 * -header. Per a direct request: "We already have a search field that
 * shows up in the UI but to make it optional we are adding this block
 * with the same approach."
 *
 * No field/eligibility gating at all, unlike every other facet-* block --
 * this searches every column's own DataTables search-data at once, not
 * one specific field, so there's no `fieldKey` attribute, no "must be a
 * currently displayed column" check, and nothing to re-validate against
 * Column_Registry here.
 *
 * Starts disabled, exactly like gateway/datatable-search's own input --
 * there's no live DataTable instance to drive until the sibling
 * gateway/datatable-body's own view.js has initialized one, client-side.
 * src/view.js enables it once that instance exists.
 *
 * "Should facet together with other facets... combined... to finalize
 * the query allowing for further refinement" needs no extra code at all:
 * DataTables' own `.search()` (global search) already runs ANDed against
 * every active per-column `column().search()` call and every registered
 * `$.fn.dataTable.ext.search` filter function (gateway/facet's/-has
 * -value's own custom compare filters included) as part of its own
 * built-in filtering pass -- this block's only job is to feed that
 * already-combining global search, identical to what gateway/datatable
 * -search already does.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-facet-search' ) );
$field_id            = 'gateway-facet-search-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet-search__label">
		<?php esc_html_e( 'Search:', 'gateway' ); ?>
	</label>
	<input
		type="search"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-facet-search__input"
		disabled
	/>
</div>
