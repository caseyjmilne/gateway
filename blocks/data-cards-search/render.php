<?php
/**
 * Server-side render for the gateway/data-cards-search block.
 *
 * Unlike gateway/datatable-search (a disabled skeleton until DataTables
 * exists client-side), this input starts fully enabled: gateway/
 * data-cards-body's own render.php already ran the real WP_Query for the
 * initial page before this ever renders, so there's no live-library
 * initialization to wait for at all -- src/view.js only ever adds a
 * debounced fetch-on-input listener to an already-usable field.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-search' ) );
$field_id            = 'gateway-cards-search-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>">
		<?php esc_html_e( 'Search:', 'gateway' ); ?>
	</label>
	<input
		type="search"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-data-cards-search__input"
	/>
</div>
