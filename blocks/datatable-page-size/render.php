<?php
/**
 * Server-side render for the gateway/datatable-page-size block.
 *
 * A dedicated replacement for DataTables' own default "Show N entries per
 * page" control (its `pageLength` feature, rendered by default in the
 * `topStart` layout slot) -- an empty, disabled <select> here, fully
 * populated by src/view.js once the sibling table's DataTable instance
 * exists. There's nothing more meaningful to render server-side: the
 * actual choice list is `shared/datatable.js`'s computed `lengthMenu`
 * (the site's configured Page Size folded into the default [10, 25, 50,
 * 100]), which only exists once DataTables has actually initialized --
 * duplicating that computation here in PHP would be a second source of
 * truth for the same list.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-page-size' ) );
$field_id            = 'gateway-page-size-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<select
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-datatable-page-size__select"
		disabled
	></select>
	<label for="<?php echo esc_attr( $field_id ); ?>">
		<?php esc_html_e( 'entries per page', 'gateway' ); ?>
	</label>
</div>
