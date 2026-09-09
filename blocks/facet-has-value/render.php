<?php
/**
 * Server-side render for the gateway/facet-has-value block.
 *
 * Structurally gateway/facet's own close sibling -- same sourceType/
 * postType/collection/columns context, same "must be a currently
 * displayed column" gate (a facet's DataTables column index is how the
 * front end hooks into it -- see view.js). The one real difference: this
 * block is entirely SELF-CONTAINED, with its own `fieldKey` attribute,
 * rather than pointing at one of the parent's own pre-registered `facets`
 * (gateway/datatable's own Facets panel) -- see gateway/card-facet-has
 * -value/render.php's own docblock for the full "why": that panel's own
 * field list is gated on `isFilterable`, which excludes several real
 * field types (Password, both Relate types, ...) a Has Value check is
 * still perfectly meaningful for.
 *
 * Renders a single control, unchecked by default. Unlike gateway/card
 * -facet-has-value (a REST refetch, real server-side query), this runs
 * entirely CLIENT-SIDE against rows already fully loaded into the table
 * (same as every other gateway/facet control) -- see view.js for the
 * actual "does this cell's own text have anything in it" check.
 *
 * `displayAsCheckbox` (default `false`) is purely visual -- see gateway/
 * card-facet-has-value/render.php's own docblock for the full "why" (a
 * direct request: "has value should be a toggle by default and option to
 * set it to a checkbox"). The real `<input type="checkbox">` view.js
 * hooks into (`.gateway-facet-has-value__checkbox`) never changes either
 * way.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey, displayAsCheckbox.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/datatable.
 */

defined( 'ABSPATH' ) || exit;

$source_type = isset( $block->context['gateway/datatable/sourceType'] ) && 'collection' === $block->context['gateway/datatable/sourceType']
	? 'collection'
	: 'postType';

$post_type = isset( $block->context['gateway/datatable/postType'] )
	? sanitize_key( $block->context['gateway/datatable/postType'] )
	: '';

$collection = isset( $block->context['gateway/datatable/collection'] ) && is_string( $block->context['gateway/datatable/collection'] )
	? $block->context['gateway/datatable/collection']
	: '';

$parent_columns = isset( $block->context['gateway/datatable/columns'] ) && is_array( $block->context['gateway/datatable/columns'] )
	? $block->context['gateway/datatable/columns']
	: array();

$field_key = isset( $attributes['fieldKey'] ) && is_string( $attributes['fieldKey'] ) ? trim( $attributes['fieldKey'] ) : '';

$has_source = 'collection' === $source_type ? '' !== $collection : '' !== $post_type;

if ( ! $has_source || '' === $field_key ) {
	return; // Not configured yet.
}

// Must still be a currently displayed column -- its DataTables column
// index is how view.js hooks into it at all. Not trusted from
// $attributes; re-checked here against the parent's actual current state
// via context, same as gateway/facet's own render.php.
$is_displayed_column = false;

foreach ( $parent_columns as $column ) {
	if ( isset( $column['key'] ) && $column['key'] === $field_key ) {
		$is_displayed_column = true;
		break;
	}
}

if ( ! $is_displayed_column ) {
	return;
}

// Never trust the editor's own picker alone -- the same re-validation
// discipline gateway/card-facet-has-value's own render.php already
// applies, against this post type's/Collection's live current config.
$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $field_key )
	: \Gateway\Column_Registry::get_column( $post_type, $field_key );

if ( ! $column_definition || empty( $column_definition['isHasValueEligible'] ) ) {
	return;
}

$label = $column_definition['label'];

// See gateway/card-facet-has-value/render.php's own comment on this same
// attribute -- a site owner's override, falling back to "Has {label}"
// when not set.
$title = isset( $attributes['title'] ) && is_string( $attributes['title'] ) ? trim( $attributes['title'] ) : '';

$display_as_checkbox = ! empty( $attributes['displayAsCheckbox'] );

$field_id           = 'gateway-facet-has-value-' . wp_unique_id();
$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-facet gateway-facet-has-value',
		'data-facet-key' => $field_key,
		'data-ui-type'   => 'hasvalue',
	)
);
$control_class = 'gateway-facet-has-value__control gateway-facet-has-value__control--' . ( $display_as_checkbox ? 'checkbox' : 'toggle' );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label class="<?php echo esc_attr( $control_class ); ?>" for="<?php echo esc_attr( $field_id ); ?>">
		<input
			type="checkbox"
			id="<?php echo esc_attr( $field_id ); ?>"
			class="gateway-facet-has-value__checkbox"
		/>
		<?php if ( ! $display_as_checkbox ) : ?>
			<span class="gateway-facet-has-value__toggle-slider" aria-hidden="true"></span>
		<?php endif; ?>
		<span class="gateway-facet-has-value__control-text">
			<?php
			echo '' !== $title
				? esc_html( $title )
				: esc_html(
					sprintf(
						/* translators: %s: field label. */
						__( 'Has %s', 'gateway' ),
						$label
					)
				);
			?>
		</span>
	</label>
</div>
