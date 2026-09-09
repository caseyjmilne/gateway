<?php
/**
 * Server-side render for the gateway/facet-text block.
 *
 * Structurally gateway/facet-has-value's own close sibling -- same
 * sourceType/postType/collection/columns context, same "must be a
 * currently displayed column" gate (a facet's DataTables column index is
 * how the front end hooks into it -- see view.js), same self-contained
 * `fieldKey` attribute rather than pointing at one of the parent's own
 * pre-registered `facets`. The one real difference: the eligibility flag
 * is `isTextRenderable` instead of `isHasValueEligible` -- per a direct
 * request ("This should only show list of fields that have text") -- and
 * the control is a plain text input doing a "contains" search rather than
 * a has-a-value check.
 *
 * Renders markup identical in shape to gateway/facet's own "input" UI
 * type (`.gateway-facet` wrapper, `data-ui-type="input"`,
 * `data-compare="LIKE"`, a child `.gateway-facet__input`) -- see
 * src/view.js, a slimmed-down clone of gateway/facet/src/view.js's own
 * plain-substring 'input' branch: since `compare` here is always 'LIKE'
 * (never one of CUSTOM_COMPARE_OPERATORS), it's just
 * `column().search( value, false, false ).draw()`, DataTables' own
 * default "Contains" behavior -- no custom `ext.search` filter needed.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey.
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
// via context, same as gateway/facet-has-value's own render.php.
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
// discipline gateway/facet-has-value's own render.php already applies,
// against this post type's/Collection's live current config.
$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $field_key )
	: \Gateway\Column_Registry::get_column( $post_type, $field_key );

if ( ! $column_definition || empty( $column_definition['isTextRenderable'] ) ) {
	return;
}

$label = $column_definition['label'];

$field_id           = 'gateway-facet-text-' . wp_unique_id();
$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-facet gateway-facet-text',
		'data-facet-key' => $field_key,
		'data-ui-type'   => 'input',
		'data-compare'   => 'LIKE',
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet__label">
		<?php echo esc_html( $label ); ?>
	</label>
	<input
		type="text"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-facet__input"
		placeholder="<?php echo esc_attr( sprintf( /* translators: %s: field label. */ __( 'Filter by %s…', 'gateway' ), $label ) ); ?>"
	/>
</div>
