<?php
/**
 * Server-side render for the gateway/card-facet-text block.
 *
 * Structurally gateway/card-facet-has-value's own close sibling -- same
 * self-contained shape (its own `fieldKey` attribute, not routed through
 * the parent's pre-registered `facets`), same context, same
 * "never trust the editor's own picker alone" re-validation against
 * Column_Registry's live current config. The one real difference: the
 * eligibility flag is `isTextRenderable` instead of `isHasValueEligible`
 * -- per a direct request ("This should only show list of fields that
 * have text, and I think we already have a field type function that
 * describes this") -- and the control itself is a plain text input,
 * doing a "contains" search rather than a has-a-value check.
 *
 * Deliberately emits the exact same markup shape gateway/card-facet's own
 * "input" UI type already renders (`.gateway-card-facet` wrapper,
 * `data-ui-type="input"`, `data-compare="LIKE"`, a child
 * `.gateway-card-facet__input`) -- see shared/cards.js's own
 * collectActiveFacets(), whose generic 'input' branch already reads
 * exactly that shape and forwards `{ key, compare: 'LIKE', value }` to
 * the REST fetch. That's the whole reason this block needs no new
 * front-end wiring of its own beyond triggering a refetch on change (see
 * src/view.js) -- 'LIKE' ("Contains") is already fully implemented,
 * unmodified, in both Facet_Query::apply_collection_facets() and
 * apply_facets()/filter_posts_where().
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

// Never trust the editor's own picker alone -- the same re-validation
// discipline gateway/card-facet-has-value's own render.php already
// applies, against this post type's/Collection's live current config.
$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $field_key )
	: \Gateway\Column_Registry::get_column( $post_type, $field_key );

if ( ! $column_definition || empty( $column_definition['isTextRenderable'] ) ) {
	return;
}

$label = $column_definition['label'];

$field_id           = 'gateway-card-facet-text-' . wp_unique_id();
$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-card-facet gateway-card-facet-text',
		'data-facet-key' => $field_key,
		'data-ui-type'   => 'input',
		'data-compare'   => 'LIKE',
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet__label">
		<?php echo esc_html( $label ); ?>
	</label>
	<input
		type="text"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-card-facet__input"
		placeholder="<?php echo esc_attr( sprintf( /* translators: %s: field label. */ __( 'Filter by %s…', 'gateway' ), $label ) ); ?>"
	/>
</div>
