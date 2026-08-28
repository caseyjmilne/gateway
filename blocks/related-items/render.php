<?php
/**
 * Server-side render for the gateway/related-items block.
 *
 * Loops over one of the current record's own `hasMany`/`belongsToMany`
 * relationships (e.g. an Event's own Tickets), repeating this block's own
 * InnerBlocks template once per related record -- the exact same
 * synthetic-wrapper-block/`render_block_context` mechanism
 * `Data_Cards_Renderer::render_items_for_collection()` already uses for
 * the top-level Data Cards grid itself, reused here as-is (a related
 * record's own field values are read the same way a top-level one's are
 * -- `gateway/card-field-text` needs no changes at all to work inside
 * this block's own template; see this block's own `providesContext` for
 * why).
 *
 * Like `gateway/card-field-text/render.php`, this deliberately does NOT
 * read `gateway/data-cards/collection` from context on the front end,
 * even though it's declared in `usesContext` (the editor's own `edit.js`
 * does read it, for its relationship picker) -- on the front end this
 * block is a descendant of the *synthetic* wrapper block
 * `render_items_for_collection()` constructs, which never inherits the
 * real tree's own `providesContext` chain; only the `record` key that
 * mechanism explicitly injects reaches it. The parent record's own class
 * is instead read directly off the record itself (`get_class( $record )`),
 * always correct by construction.
 *
 * One query per *parent* record (`$record->{$method}()->get()`), not a
 * batched eager-load -- this is a genuinely different shape of work than
 * "Related Fields"' own eager-loading (a single flat list of columns
 * shared across every row of one query): a per-card sub-loop like this
 * one is inherently "for each outer record, fetch its own related rows,"
 * the same accepted cost a nested Query Loop block already carries in
 * core.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: relationshipMethod, relatedCollection, limit.
 * @var string   $content    Inner block content (unused -- the real per-item rendering below replaces it).
 * @var WP_Block $block      Block instance, with `record` in context from the parent gateway/data-cards-body.
 */

defined( 'ABSPATH' ) || exit;

$record = $block->context['record'] ?? null;

$method = isset( $attributes['relationshipMethod'] ) && is_string( $attributes['relationshipMethod'] )
	? trim( $attributes['relationshipMethod'] )
	: '';

if ( '' === $method || ! ( $record instanceof \Illuminate\Database\Eloquent\Model ) ) {
	return;
}

$collection = get_class( $record );

// Only ever trust a relationship that's genuinely still one of this
// model's own "to many" relationships -- a stale relationshipMethod (the
// relationship was removed, or its type changed, since this block was
// configured) must never surface whatever method happens to share its
// name on the record instead. Matches Column_Registry::
// get_related_columns_for_collection()'s own "hasMany/belongsToMany are
// the only relationship types with a real list to loop over" reasoning.
$relationship = \Gateway\Model_Relationships::find( $collection, $method );

if ( ! $relationship || ! in_array( $relationship['type'], array( 'hasMany', 'belongsToMany' ), true ) ) {
	return;
}

$limit = absint( $attributes['limit'] ?? 0 );

try {
	$query   = $record->{ $method }();
	$related = $limit > 0 ? $query->take( $limit )->get() : $query->get();
} catch ( \Throwable $e ) {
	return;
}

// No separate stylesheet for three trivial list-reset rules -- this
// block has no other front-end JS/CSS need at all (unlike e.g.
// gateway/data-cards-body, whose own view.js/style.scss earn their
// keep via real pagination interactivity), so inline style avoids
// shipping an otherwise-empty extra build asset just for this.
$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class' => 'gateway-related-items',
		'style' => 'list-style:none;margin:0;padding:0;',
	)
);

if ( 0 === $related->count() ) {
	$related_label = \Gateway\Model_Builder::get_plural_title( $relationship['related_model'] );
	$related_label = '' !== $related_label ? $related_label : $relationship['related_model'];
	?>
	<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
		<p class="gateway-related-items__empty">
			<?php
			printf(
				/* translators: %s: related model label. */
				esc_html__( 'No %s found.', 'gateway' ),
				esc_html( $related_label )
			);
			?>
		</p>
	</div>
	<?php
	return;
}

$template_blocks = ! empty( $block->parsed_block['innerBlocks'] ) ? $block->parsed_block['innerBlocks'] : array();

$items_html = \Gateway\Data_Cards_Renderer::render_items_for_collection( $related, $template_blocks, 'gateway-related-items__item' );
?>
<ul <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>><?php echo $items_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></ul>
