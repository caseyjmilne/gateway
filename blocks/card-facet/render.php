<?php
/**
 * Server-side render for the gateway/card-facet block.
 *
 * Renders the interactive filter control (input/select/checkboxes) for one
 * of the parent gateway/data-cards block's configured facets. Everything
 * this needs about that parent -- sourceType, postType/collection, facets
 * -- arrives via block context (see gateway/data-cards's block.json
 * "providesContext" and this block's "usesContext"), which propagates
 * transitively through any number of intermediate blocks that don't
 * themselves override it -- this block doesn't need to be a *direct*
 * child of gateway/data-cards to see its context.
 *
 * `block.json`'s own "ancestor" (not "parent") restriction reflects this
 * directly: this block only requires SOME gateway/data-cards ancestor,
 * at any depth, with no restriction at all on what sits directly around
 * it -- a plain core/group ("Row"/"Stack"/whatever a site owner
 * transforms it into), core/columns, or any other layout block. An
 * earlier version restricted this to a small, fixed set of allowed
 * DIRECT parents (a dedicated gateway/data-cards-facets zone -- since
 * removed entirely -- or gateway/data-cards-header/-footer/itself)
 * before this plugin started preferring real core blocks for layout over
 * more bespoke container blocks of its own; see this plugin's own
 * README for the fuller reasoning. The one thing that hasn't changed:
 * this is still never expected as a descendant of gateway/data-cards
 * -body's own synthetic per-record wrapper -- nothing technically stops
 * it (context still resolves fine there too), but a per-record facet
 * control has no coherent meaning; that's simply not a placement this
 * block's own Inspector or documentation ever guides a site owner
 * toward.
 *
 * A trimmed gateway/facet/render.php: gateway/facet also requires its
 * facet's field to be a currently *displayed column* (its DataTables
 * column index is how the front end targets it) -- gateway/card-facet has
 * no columns/table/column-index concept at all (it drives a REST refetch
 * instead -- see src/view.js and shared/cards.js), so that half of the
 * check simply has no counterpart here. The "must still be configured on
 * the parent" half stays: a facet can be removed from gateway/data-cards'
 * own Facets panel independently of any gateway/card-facet block
 * referencing it.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
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

$parent_facets = isset( $block->context['gateway/data-cards/facets'] ) && is_array( $block->context['gateway/data-cards/facets'] )
	? $block->context['gateway/data-cards/facets']
	: array();

$facet_key = isset( $attributes['facetKey'] ) && is_string( $attributes['facetKey'] ) ? $attributes['facetKey'] : '';
$ui_type   = isset( $attributes['uiType'] ) ? $attributes['uiType'] : 'input';
$compare   = isset( $attributes['compare'] ) && is_string( $attributes['compare'] ) ? $attributes['compare'] : 'LIKE';

if ( ! in_array( $ui_type, array( 'input', 'select', 'checkboxes' ), true ) ) {
	$ui_type = 'input';
}

// Legacy values from before this control's vocabulary was unified with
// the real operators Facet_Query::apply_collection_facets()/apply_facets()
// expect (and the top-level Facets panel's own Default-value modal
// already used) -- translated forward rather than silently reset to the
// default, so an already-published card-facet block keeps its configured
// behavior. Only meaningful for the "input" UI type -- Select/Checkboxes
// are always exact matches against a fixed list of values (see
// ui-type-control.js/view.js), so an invalid value here is harmless
// either way.
if ( 'contains' === $compare ) {
	$compare = 'LIKE';
} elseif ( 'equals' === $compare ) {
	$compare = '=';
} elseif ( ! in_array( $compare, \Gateway\Facet_Query::ALLOWED_COMPARE, true ) ) {
	$compare = 'LIKE';
}

$has_source = 'collection' === $source_type ? '' !== $collection : '' !== $post_type;

if ( ! $has_source || '' === $facet_key ) {
	return; // Not configured yet.
}

// The facet this block represents must still be configured on the parent
// (facets can be removed there independently of any gateway/card-facet
// block referencing them) -- not trusted from $attributes, re-checked
// here against the parent's actual current state via context. (The
// editor warns about this too -- see facet-key-control.js's usage in
// edit.js.)
$facet_definition = null;

foreach ( $parent_facets as $candidate ) {
	if ( isset( $candidate['key'] ) && $candidate['key'] === $facet_key ) {
		$facet_definition = $candidate;
		break;
	}
}

if ( ! $facet_definition ) {
	return;
}

$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $facet_key )
	: \Gateway\Column_Registry::get_column( $post_type, $facet_key );

if ( ! $column_definition ) {
	return;
}

$label = $column_definition['label'];

// The parent's preset value for this key (Facets panel), if any -- shown
// as this control's initial value/selection so a visitor sees *why* the
// grid is already narrowed, rather than a blank control that gives no
// hint a filter is active. This is purely presentational: the preset is
// always applied server-side to the initial query regardless of whether
// any gateway/card-facet block exists for it (see gateway/data-cards's
// own render.php), so the grid is already scoped before this control
// ever renders -- pre-filling it just makes that visible.
$default_value = isset( $facet_definition['value'] ) ? (string) $facet_definition['value'] : '';

$facet_options      = array();
$default_in_options = false;
$default_label      = $default_value;

if ( in_array( $ui_type, array( 'select', 'checkboxes' ), true ) ) {
	$facet_options      = 'collection' === $source_type
		? \Gateway\Facet_Query::get_facet_options_for_collection( $collection, $column_definition )
		: \Gateway\Facet_Query::get_facet_options( $post_type, $column_definition );
	$default_in_options = '' !== $default_value && in_array( $default_value, wp_list_pluck( $facet_options, 'value' ), true );

	// The preset value might not be among the discovered options (e.g. a
	// taxonomy term outside the top-50 cap) -- when so, resolve a real
	// label for it rather than showing the raw value, and inject it into
	// the list below so it's still visible and selected.
	if ( '' !== $default_value && ! $default_in_options && 'taxonomy' === $column_definition['type'] ) {
		$term = get_term_by( 'slug', $default_value, $column_definition['key'] );

		if ( $term && ! is_wp_error( $term ) ) {
			$default_label = $term->name;
		}
	}
}

$field_id            = 'gateway-card-facet-' . wp_unique_id();
$wrapper_attributes  = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-card-facet gateway-card-facet--' . $ui_type,
		'data-facet-key' => $facet_key,
		'data-ui-type'   => $ui_type,
		'data-compare'   => $compare,
	)
);
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php if ( 'checkboxes' === $ui_type ) : ?>
		<span id="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet__label">
			<?php echo esc_html( $label ); ?>
		</span>
	<?php else : ?>
		<label for="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet__label">
			<?php echo esc_html( $label ); ?>
		</label>
	<?php endif; ?>
	<?php if ( 'input' === $ui_type ) : ?>
		<input
			type="text"
			id="<?php echo esc_attr( $field_id ); ?>"
			class="gateway-card-facet__input"
			value="<?php echo esc_attr( $default_value ); ?>"
			placeholder="<?php echo esc_attr( sprintf( /* translators: %s: field label. */ __( 'Filter by %s…', 'gateway' ), $label ) ); ?>"
		/>
	<?php elseif ( 'select' === $ui_type ) : ?>
		<select id="<?php echo esc_attr( $field_id ); ?>" class="gateway-card-facet__select">
			<option value="" <?php selected( '', $default_value ); ?>><?php esc_html_e( 'All', 'gateway' ); ?></option>
			<?php if ( '' !== $default_value && ! $default_in_options ) : ?>
				<option value="<?php echo esc_attr( $default_value ); ?>" selected>
					<?php echo esc_html( $default_label ); ?>
				</option>
			<?php endif; ?>
			<?php foreach ( $facet_options as $option ) : ?>
				<option value="<?php echo esc_attr( $option['value'] ); ?>" <?php selected( $option['value'], $default_value ); ?>>
					<?php echo esc_html( $option['label'] ); ?>
				</option>
			<?php endforeach; ?>
		</select>
	<?php elseif ( 'checkboxes' === $ui_type ) : ?>
		<div class="gateway-card-facet__checkboxes" role="group" aria-labelledby="<?php echo esc_attr( $field_id ); ?>">
			<?php if ( '' !== $default_value && ! $default_in_options ) : ?>
				<label class="gateway-card-facet__checkbox-label">
					<input
						type="checkbox"
						class="gateway-card-facet__checkbox"
						id="<?php echo esc_attr( $field_id . '-default' ); ?>"
						value="<?php echo esc_attr( $default_value ); ?>"
						checked
					/>
					<?php echo esc_html( $default_label ); ?>
				</label>
			<?php endif; ?>
			<?php foreach ( $facet_options as $index => $option ) : ?>
				<label class="gateway-card-facet__checkbox-label">
					<input
						type="checkbox"
						class="gateway-card-facet__checkbox"
						id="<?php echo esc_attr( $field_id . '-' . $index ); ?>"
						value="<?php echo esc_attr( $option['value'] ); ?>"
						<?php checked( $option['value'], $default_value ); ?>
					/>
					<?php echo esc_html( $option['label'] ); ?>
				</label>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
</div>
