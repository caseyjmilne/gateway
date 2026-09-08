<?php
/**
 * Server-side render for the gateway/card-facet-has-value block.
 *
 * Structurally gateway/card-facet's own close sibling -- same
 * sourceType/postType/collection context, same public/no-permission-check
 * front end (the parent gateway/data-cards grid is already visible to
 * anyone who can see the page at all). The one real difference: this
 * block is entirely SELF-CONTAINED, with its own `fieldKey` attribute,
 * rather than pointing at one of the parent's own pre-registered `facets`
 * (gateway/data-cards' own Facets panel) -- deliberately, per a direct
 * request: "This facet should be available for all fields... any fields
 * the user makes from the available field types is suitable." The
 * Facets panel's own field list is gated on `isFilterable`, which
 * excludes several real field types entirely (Password, both Relate
 * types, ...) that a Has Value check is still perfectly meaningful for
 * (Column_Registry's own `isHasValueEligible` flag is deliberately
 * broader -- see that flag's own docblock) -- going through that panel
 * at all would have made those fields permanently unreachable here.
 *
 * Renders a single checkbox, unchecked by default: checked means "only
 * show records where this field has a value," matching
 * Facet_Query::apply_collection_facets()/apply_facets()'s own HAS_VALUE
 * branches (LENGTH(...) > 0 for a Collection/core column; a `!=` meta_query
 * clause for a meta column) -- see that class's own docblocks for exactly
 * what "has a value" means (0/false count; null/''/unset don't).
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: fieldKey.
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance, with context from the parent gateway/data-cards.
 */

defined( 'ABSPATH' ) || exit;

$source_type = isset( $block->context['gateway/data-cards/sourceType'] ) && 'collection' === $block->context['gateway/data-cards/sourceType']
	? 'collection'
	: 'postType';

$post_type = isset( $block->context['gateway/data-cards/postType'] )
	? sanitize_key( $block->context['gateway/data-cards/postType'] )
	: '';

$collection = isset( $block->context['gateway/data-cards/collection'] ) && is_string( $block->context['gateway/data-cards/collection'] )
	? $block->context['gateway/data-cards/collection']
	: '';

$field_key = isset( $attributes['fieldKey'] ) && is_string( $attributes['fieldKey'] ) ? trim( $attributes['fieldKey'] ) : '';

$has_source = 'collection' === $source_type ? '' !== $collection : '' !== $post_type;

if ( ! $has_source || '' === $field_key ) {
	return; // Not configured yet.
}

// Never trust the editor's own picker alone -- the same "re-validate
// against live, current config" discipline every other field-scoped
// block in this plugin already applies to its own stored key. A stale
// key (the field was removed, or its type changed away from something
// isHasValueEligible) never reaches the front end as a real filter.
$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $field_key )
	: \Gateway\Column_Registry::get_column( $post_type, $field_key );

if ( ! $column_definition || empty( $column_definition['isHasValueEligible'] ) ) {
	return;
}

$label = $column_definition['label'];

$field_id           = 'gateway-card-facet-has-value-' . wp_unique_id();
$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-card-facet gateway-card-facet-has-value',
		'data-facet-key' => $field_key,
		'data-ui-type'   => 'hasvalue',
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label class="gateway-card-facet__checkbox-label" for="<?php echo esc_attr( $field_id ); ?>">
		<input
			type="checkbox"
			id="<?php echo esc_attr( $field_id ); ?>"
			class="gateway-card-facet-has-value__checkbox"
		/>
		<?php
		printf(
			/* translators: %s: field label. */
			esc_html__( 'Has %s', 'gateway' ),
			esc_html( $label )
		);
		?>
	</label>
</div>
