<?php
/**
 * Server-side render for the gateway/data-display block.
 *
 * A docs-style two-pane browser: every record of the configured
 * Collection (`collection`) rendered as a group heading down the left,
 * its own `hasMany` children (`relationshipMethod`) listed underneath
 * each one as clickable links -- clicking a child swaps which one's own
 * detail template (this block's own InnerBlocks) is shown in the main
 * pane on the right. Modeled directly on a typical documentation site's
 * own layout (a sidebar of doc groups, each expanding to its own docs;
 * clicking a doc loads it into the main reading pane) -- confirmed
 * against this feature's own worked example, Doc Groups -> Docs.
 *
 * Every child link is a real, unique, bookmarkable/shareable anchor --
 * `#!/{related model slug}/{slug}`, a "hashbang" fragment rather than a
 * real WordPress URL/route -- so an external page (or a saved bookmark)
 * can link straight to one specific child's own detail pane.
 * `{related model slug}` is the related model's own auto-generated
 * permalink slug (`Model_Builder::slug_for_class()` -- the same one
 * used for that model's own `#/records/{slug}` admin URL, e.g.
 * `PortfolioItem` -> `portfolio-item`), never the raw class name, so
 * this hashbang reads like a URL rather than exposing a PHP class name.
 * The child's own `{slug}` is the related model's own Permalink FIELD
 * value when it has one configured (`Model_Fields::permalink_field_for()`),
 * else the child's own bare id -- unlike gateway/single-record's
 * fully-routed template pages (real rewrite rules, `Permalink_Routes`),
 * a child here is always linkable this way regardless of whether its
 * model has a Permalink field, or a full `root`/Template Page route,
 * configured at all. See view.js's own docblock for how that fragment
 * is read back on load/hashchange.
 *
 * Everything is rendered server-side, up front, for every child across
 * every group -- there's no REST fetch on click, no pagination. A plain
 * `view.js` (see that file's own docblock) just toggles which of the
 * already-rendered `.gateway-data-display__panel` elements is visible
 * and which sidebar link carries `.is-active`, the same "PHP renders
 * real state up front, JS only ever toggles/interacts" philosophy this
 * plugin already follows elsewhere (Data Cards' own pagination, for
 * instance). A known, accepted trade-off for this first version: a
 * Collection with a very large number of groups/children renders a
 * correspondingly large page (every child's own detail markup, not just
 * the active one) -- real pagination/lazy-loading here is real, separate
 * work this version doesn't take on.
 *
 * Ordered oldest-first (`orderBy( 'id', 'asc' )`), deliberately NOT
 * newest-first the way Data Table/Data Cards' own activity-feed-shaped
 * grids default to -- this is a stable navigational index, not a feed:
 * newest-first would reorder existing sidebar entries every time a new
 * group/child is added, which is exactly the wrong feel for a sidebar a
 * visitor is expected to find the same entry in from one visit to the
 * next.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes: collection, relationshipMethod, relatedCollection.
 * @var string   $content    Inner block content (unused -- the real per-child rendering below replaces it).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$collection = isset( $attributes['collection'] ) && is_string( $attributes['collection'] )
	? trim( $attributes['collection'] )
	: '';

if ( '' === $collection || ! \Gateway\Model_Registry::has( $collection ) || ! class_exists( $collection ) ) {
	?>
	<p><?php esc_html_e( 'Choose a Collection in this block\'s settings.', 'gateway' ); ?></p>
	<?php
	return;
}

$method = isset( $attributes['relationshipMethod'] ) && is_string( $attributes['relationshipMethod'] )
	? trim( $attributes['relationshipMethod'] )
	: '';

$relationship = '' !== $method ? \Gateway\Model_Relationships::find( $collection, $method ) : null;

// Only a hasMany relationship has a single, well-defined "owning" parent
// each child belongs under -- a belongsToMany child could sensibly
// appear under several different parents at once, which this block's
// own one-child-one-group sidebar shape has no way to represent.
if ( ! $relationship || 'hasMany' !== $relationship['type'] ) {
	?>
	<p><?php esc_html_e( 'Choose a "Has Many" relationship in this block\'s settings.', 'gateway' ); ?></p>
	<?php
	return;
}

$related_model      = $relationship['related_model'];
$related_model_slug = \Gateway\Model_Builder::slug_for_class( $related_model );

$permalink_field = \Gateway\Model_Fields::permalink_field_for( $related_model );

/**
 * A child's own unique slug for the `#!/{related model}/{slug}` link --
 * see this file's own docblock. A closure, not a top-level named
 * function: this file is `include`d fresh for every instance of this
 * block on the same page (WordPress' own dynamic-block render
 * mechanism), and a top-level `function` declaration would fatal on the
 * second one.
 *
 * @param \Illuminate\Database\Eloquent\Model $child
 * @return string
 */
$compute_child_slug = function ( $child ) use ( $permalink_field ) {
	if ( $permalink_field ) {
		$value = $child->{ $permalink_field['name'] } ?? null;

		if ( is_string( $value ) && '' !== $value ) {
			return $value;
		}
	}

	return (string) $child->id;
};

$template_blocks = ! empty( $block->parsed_block['innerBlocks'] ) ? $block->parsed_block['innerBlocks'] : array();

$parent_display_field = \Gateway\Records_REST_Controller::resolve_display_field( $collection );
$child_display_field  = \Gateway\Records_REST_Controller::resolve_display_field( $related_model );

$parents = $collection::query()->orderBy( 'id', 'asc' )->get();

$sidebar_html    = '';
$all_children    = new \Illuminate\Database\Eloquent\Collection();
$first_child_id  = null;
$has_any_children = false;

foreach ( $parents as $parent ) {
	$group_label = \Gateway\Records_REST_Controller::record_option( $parent, $parent_display_field )['label'];

	$children = $parent->{ $method }()->orderBy( 'id', 'asc' )->get();

	$sidebar_html .= '<li class="gateway-data-display__group">';
	$sidebar_html .= '<div class="gateway-data-display__group-heading">' . esc_html( $group_label ) . '</div>';

	if ( $children->count() > 0 ) {
		$has_any_children = true;
		$sidebar_html     .= '<ul class="gateway-data-display__children">';

		foreach ( $children as $child ) {
			if ( null === $first_child_id ) {
				$first_child_id = $child->id;
			}

			$child_label = \Gateway\Records_REST_Controller::record_option( $child, $child_display_field )['label'];
			$is_active   = $child->id === $first_child_id;
			$child_slug  = $compute_child_slug( $child );

			// A real <a href>, not a <button> -- clicking it updates
			// `location.hash` entirely on its own (native browser
			// behavior), which is also exactly what view.js's own
			// `hashchange` listener needs to react to; no click handler
			// of this block's own is involved at all any more.
			$sidebar_html .= sprintf(
				'<li><a href="#!/%1$s/%2$s" class="gateway-data-display__child-link%3$s" data-child-id="%4$d" data-child-slug="%5$s" aria-current="%6$s">%7$s</a></li>',
				rawurlencode( $related_model_slug ),
				rawurlencode( $child_slug ),
				$is_active ? ' is-active' : '',
				(int) $child->id,
				esc_attr( $child_slug ),
				$is_active ? 'true' : 'false',
				esc_html( $child_label )
			);

			$all_children->push( $child );
		}

		$sidebar_html .= '</ul>';
	}

	$sidebar_html .= '</li>';
}

$wrapper_attributes = get_block_wrapper_attributes(
	array(
		'class'                   => 'gateway-data-display',
		// Read by view.js so a hashbang fragment belonging to a
		// DIFFERENT Collection's own Data Display block elsewhere on the
		// same page (or to an unrelated feature entirely) is never
		// mistaken for this instance's own -- see that file's own
		// docblock. The related model's own slug (not its raw class
		// name), matching what's now built into the href above.
		'data-related-collection' => $related_model_slug,
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<nav class="gateway-data-display__sidebar">
		<?php if ( '' === $sidebar_html ) : ?>
			<p class="gateway-data-display__empty">
				<?php
				$collection_label = \Gateway\Model_Builder::get_plural_title( $collection );
				$collection_label = '' !== $collection_label ? $collection_label : $collection;
				printf(
					/* translators: %s: collection (model) label. */
					esc_html__( 'No %s found.', 'gateway' ),
					esc_html( $collection_label )
				);
				?>
			</p>
		<?php else : ?>
			<ul class="gateway-data-display__groups"><?php echo $sidebar_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></ul>
		<?php endif; ?>
	</nav>
	<div class="gateway-data-display__main">
		<?php if ( empty( $template_blocks ) ) : ?>
			<p class="gateway-data-display__empty">
				<?php esc_html_e( 'Design a template in this block\'s editor to show a child record\'s own detail here.', 'gateway' ); ?>
			</p>
		<?php elseif ( ! $has_any_children ) : ?>
			<p class="gateway-data-display__empty">
				<?php
				$related_label = \Gateway\Model_Builder::get_plural_title( $related_model );
				$related_label = '' !== $related_label ? $related_label : $related_model;
				printf(
					/* translators: %s: related model label. */
					esc_html__( 'No %s found.', 'gateway' ),
					esc_html( $related_label )
				);
				?>
			</p>
		<?php else : ?>
			<ul class="gateway-data-display__panels">
				<?php
				echo \Gateway\Data_Cards_Renderer::render_items_for_collection( // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
					$all_children,
					$template_blocks,
					'gateway-data-display__panel',
					function ( $record ) use ( $first_child_id, $compute_child_slug ) {
						$attributes = 'data-child-id="' . (int) $record->id . '" data-child-slug="' . esc_attr( $compute_child_slug( $record ) ) . '"';

						if ( $record->id !== $first_child_id ) {
							$attributes .= ' hidden';
						}

						return $attributes;
					}
				);
				?>
			</ul>
		<?php endif; ?>
	</div>
</div>
