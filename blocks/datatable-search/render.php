<?php
/**
 * Server-side render for the gateway/datatable-search block.
 *
 * A dedicated replacement for DataTables' own default global search box
 * (its `search` feature, rendered by default in the `topEnd` layout slot)
 * -- a disabled <input> here, wired up by src/view.js once the sibling
 * table's DataTable instance exists.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-search' ) );
$field_id            = 'gateway-search-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>">
		<?php esc_html_e( 'Search:', 'gateway' ); ?>
	</label>
	<input
		type="search"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-datatable-search__input"
		disabled
	/>
</div>
