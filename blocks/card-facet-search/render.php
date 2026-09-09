<?php
/**
 * Server-side render for the gateway/card-facet-search block.
 *
 * The single, shared search implementation for Data Cards -- "search
 * across every text-renderable field, contains" (src/view.js drives
 * fetchCardsPage()/renderCardsPage()'s own `search` parameter) -- as a
 * self-contained facet-family block (ancestor: gateway/data-cards, like
 * gateway/card-facet-has-value/-text) rather than a fixed slot bound to
 * one specific position. Originally added alongside the older, structurally
 * fixed gateway/data-cards-search (per a direct request: "We already have
 * a search field that shows up in the UI but to make it optional we are
 * adding this block with the same approach"); that older block was
 * removed entirely once this one existed, per a direct follow-up
 * ("we only need 1 implementation of a search facet") -- see README.md's
 * "One search implementation, not two". gateway/data-cards' own template
 * now seeds THIS block (not the removed one) inside its Header (a plain
 * core/group Row, not its own bespoke block -- see gateway/data-cards/
 * src/edit.js's own docblock) by default, so a freshly inserted Data
 * Cards block keeps a working search box in the same spot as before.
 *
 * No field/eligibility gating at all, unlike every other card-facet-*
 * block -- this searches every currently-available text-renderable field
 * at once (Data_Cards_Renderer::apply_collection_search() for a
 * Collection; WP_Query's own native `s` param for a postType), not one
 * specific column, so there's no `fieldKey` attribute and nothing to
 * re-validate against Column_Registry here.
 *
 * "Should facet together with other facets... combined... to finalize
 * the query allowing for further refinement" needs no extra code at all:
 * shared/cards.js's fetchCardsPage() already sends BOTH `search` and
 * `facets` in the very same request, and Data_Cards_Renderer applies them
 * as two separately-scoped, ANDed conditions either way -- Facet_Query::
 * apply_collection_facets()/apply_facets() first, then
 * apply_collection_search()'s own nested-closure OR-across-fields (a
 * Collection) or WP_Query's native `s` (a postType) layered on top. This
 * block's only job is to feed that same, already-combining `search`
 * parameter.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-card-facet-search' ) );
$field_id            = 'gateway-card-facet-search-' . wp_unique_id();
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet-search__label">
		<?php esc_html_e( 'Search:', 'gateway' ); ?>
	</label>
	<input
		type="search"
		id="<?php echo esc_attr( $field_id ); ?>"
		class="gateway-card-facet-search__input"
	/>
</div>
