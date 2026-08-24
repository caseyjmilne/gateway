<?php
/**
 * Server-side render for the gateway/facet block.
 *
 * Renders the interactive filter control (input/select/checkboxes) for one
 * of the parent gateway/datatable block's configured facets. Everything
 * this needs about that parent -- postType, columns, facets -- arrives via
 * block context (see gateway/datatable's block.json "providesContext" and
 * this block's "usesContext"), the same mechanism that makes a facet
 * "discoverable by other scripts": any block nested inside a datatable
 * block, not just this one, can read the same context.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/datatable.
 */

defined( 'ABSPATH' ) || exit;

$post_type = isset( $block->context['gateway/datatable/postType'] )
	? sanitize_key( $block->context['gateway/datatable/postType'] )
	: '';

$parent_facets = isset( $block->context['gateway/datatable/facets'] ) && is_array( $block->context['gateway/datatable/facets'] )
	? $block->context['gateway/datatable/facets']
	: array();

$parent_columns = isset( $block->context['gateway/datatable/columns'] ) && is_array( $block->context['gateway/datatable/columns'] )
	? $block->context['gateway/datatable/columns']
	: array();

$facet_key = isset( $attributes['facetKey'] ) && is_string( $attributes['facetKey'] ) ? $attributes['facetKey'] : '';
$ui_type   = isset( $attributes['uiType'] ) ? $attributes['uiType'] : 'input';

if ( ! in_array( $ui_type, array( 'input', 'select', 'checkboxes' ), true ) ) {
	$ui_type = 'input';
}

if ( ! $post_type || '' === $facet_key ) {
	return; // Not configured yet.
}

// The facet this block represents must still be configured on the parent
// (facets can be removed there independently of any gateway/facet block
// referencing them), and -- since a facet's DataTables column index is how
// the front end hooks into it -- must also be a currently displayed
// column. Neither is trusted from $attributes; both are re-checked here
// against the parent's actual current state via context. (The editor
// warns about both cases -- see facet-key-control.js.)
$facet_definition = null;

foreach ( $parent_facets as $candidate ) {
	if ( isset( $candidate['key'] ) && $candidate['key'] === $facet_key ) {
		$facet_definition = $candidate;
		break;
	}
}

$is_displayed_column = false;

foreach ( $parent_columns as $column ) {
	if ( isset( $column['key'] ) && $column['key'] === $facet_key ) {
		$is_displayed_column = true;
		break;
	}
}

if ( ! $facet_definition || ! $is_displayed_column ) {
	return;
}

$column_definition = \Gateway\Column_Registry::get_column( $post_type, $facet_key );

if ( ! $column_definition ) {
	return;
}

$label               = $column_definition['label'];
$field_id            = 'gateway-facet-' . wp_unique_id();
$wrapper_attributes  = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-facet gateway-facet--' . $ui_type,
		'data-facet-key' => $facet_key,
		'data-ui-type'   => $ui_type,
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php if ( 'checkboxes' === $ui_type ) : ?>
		<span id="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet__label">
			<?php echo esc_html( $label ); ?>
		</span>
	<?php else : ?>
		<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet__label">
			<?php echo esc_html( $label ); ?>
		</label>
	<?php endif; ?>
	<?php if ( 'input' === $ui_type ) : ?>
		<input
			type="text"
			id="<?php echo esc_attr( $field_id ); ?>"
			class="gateway-facet__input"
			placeholder="<?php echo esc_attr( sprintf( /* translators: %s: field label. */ __( 'Filter by %s…', 'gateway' ), $label ) ); ?>"
		/>
	<?php elseif ( 'select' === $ui_type ) : ?>
		<select id="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet__select">
			<option value=""><?php esc_html_e( 'All', 'gateway' ); ?></option>
			<?php foreach ( \Gateway\Facet_Query::get_distinct_values( $post_type, $column_definition ) as $value ) : ?>
				<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $value ); ?></option>
			<?php endforeach; ?>
		</select>
	<?php elseif ( 'checkboxes' === $ui_type ) : ?>
		<div class="gateway-facet__checkboxes" role="group" aria-labelledby="<?php echo esc_attr( $field_id ); ?>">
			<?php foreach ( \Gateway\Facet_Query::get_distinct_values( $post_type, $column_definition ) as $index => $value ) : ?>
				<label class="gateway-facet__checkbox-label">
					<input
						type="checkbox"
						class="gateway-facet__checkbox"
						id="<?php echo esc_attr( $field_id . '-' . $index ); ?>"
						value="<?php echo esc_attr( $value ); ?>"
					/>
					<?php echo esc_html( $value ); ?>
				</label>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
</div>
