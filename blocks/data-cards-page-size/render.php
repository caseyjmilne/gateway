<?php
/**
 * Server-side render for the gateway/data-cards-page-size block.
 *
 * Unlike gateway/datatable-page-size (an empty, disabled <select> until
 * DataTables exists client-side and can be asked for its own real
 * lengthMenu), this block already knows everything it needs at PHP-render
 * time: the parent gateway/data-cards' own Page Size setting, via context
 * -- no live library instance to wait for. Real <option>s, already
 * selected correctly, render here directly.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$page_size   = absint( $block->context['gateway/data-cards/pageSize'] ?? 12 );
$length_menu = \Gateway\Data_Cards_Renderer::build_length_menu( $page_size );

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-cards-page-size' ) );
$field_id            = 'gateway-cards-page-size-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<select
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-data-cards-page-size__select"
	>
		<?php foreach ( $length_menu as $length ) : ?>
			<option value="<?php echo esc_attr( $length ); ?>" <?php selected( $length, $page_size ); ?>>
				<?php echo esc_html( $length ); ?>
			</option>
		<?php endforeach; ?>
	</select>
	<label for="<?php echo esc_attr( $field_id ); ?>">
		<?php esc_html_e( 'entries per page', 'gateway' ); ?>
	</label>
</div>
