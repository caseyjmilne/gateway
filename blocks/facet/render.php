<?php
/**
 * Server-side render for the gateway/facet block.
 *
 * Renders the interactive filter control (input/select/checkboxes) for one
 * of the parent gateway/datatable block's configured facets. Everything
 * this needs about that parent -- sourceType, postType/collection, columns,
 * facets -- arrives via block context (see gateway/datatable's block.json
 * "providesContext" and this block's "usesContext"), the same mechanism
 * that makes a facet "discoverable by other scripts": any block nested
 * inside a datatable block, not just this one, can read the same context --
 * context propagates transitively through any number of intermediate
 * blocks (here, gateway/datatable-facets, this block's direct parent) that
 * don't themselves override it, so this block doesn't need to be a
 * *direct* child of gateway/datatable to see its context.
 *
 * `sourceType` branches the column/options lookup the same way gateway/
 * card-facet's own render.php does -- Column_Registry::
 * get_column_for_collection()/Facet_Query::get_facet_options_for_collection()
 * in place of their postType counterparts when the parent's data source is
 * a Collection. The "must also be a displayed column" gate below is
 * unaffected either way: `gateway/datatable/columns` context already
 * reflects whichever source is active (datatable-body/render.php validates
 * it against the right Column_Registry method itself).
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
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

$parent_facets = isset( $block->context['gateway/datatable/facets'] ) && is_array( $block->context['gateway/datatable/facets'] )
	? $block->context['gateway/datatable/facets']
	: array();

$parent_columns = isset( $block->context['gateway/datatable/columns'] ) && is_array( $block->context['gateway/datatable/columns'] )
	? $block->context['gateway/datatable/columns']
	: array();

$facet_key = isset( $attributes['facetKey'] ) && is_string( $attributes['facetKey'] ) ? $attributes['facetKey'] : '';
$ui_type   = isset( $attributes['uiType'] ) ? $attributes['uiType'] : 'input';
$compare   = isset( $attributes['compare'] ) ? $attributes['compare'] : 'contains';

if ( ! in_array( $ui_type, array( 'input', 'select', 'checkboxes' ), true ) ) {
	$ui_type = 'input';
}

// Only meaningful for the "input" UI type -- Select/Checkboxes are always
// exact matches against a fixed list of values (see ui-type-control.js /
// view.js), so an invalid value here is harmless either way.
if ( 'equals' !== $compare ) {
	$compare = 'contains';
}

$has_source = 'collection' === $source_type ? '' !== $collection : '' !== $post_type;

if ( ! $has_source || '' === $facet_key ) {
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

$column_definition = 'collection' === $source_type
	? \Gateway\Column_Registry::get_column_for_collection( $collection, $facet_key )
	: \Gateway\Column_Registry::get_column( $post_type, $facet_key );

if ( ! $column_definition ) {
	return;
}

$label = $column_definition['label'];

// The parent's preset value for this key (Facets panel), if any -- shown as
// this control's initial value/selection so a visitor sees *why* the table
// is already narrowed, rather than a blank control that gives no hint a
// filter is active. This is purely presentational: the preset is always
// applied server-side to the initial query regardless of whether any
// gateway/facet block exists for it (see render.php on the parent block),
// so the rows are already scoped before this control ever renders --
// pre-filling it just makes that visible.
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

$field_id            = 'gateway-facet-' . wp_unique_id();
$wrapper_attributes  = get_block_wrapper_attributes(
	array(
		'class'          => 'gateway-facet gateway-facet--' . $ui_type,
		'data-facet-key' => $facet_key,
		'data-ui-type'   => $ui_type,
		'data-compare'   => $compare,
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
			value="<?php echo esc_attr( $default_value ); ?>"
			placeholder="<?php echo esc_attr( sprintf( /* translators: %s: field label. */ __( 'Filter by %s…', 'gateway' ), $label ) ); ?>"
		/>
	<?php elseif ( 'select' === $ui_type ) : ?>
		<select id="<?php echo esc_attr( $field_id ); ?>" class="gateway-facet__select">
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
		<div class="gateway-facet__checkboxes" role="group" aria-labelledby="<?php echo esc_attr( $field_id ); ?>">
			<?php if ( '' !== $default_value && ! $default_in_options ) : ?>
				<label class="gateway-facet__checkbox-label">
					<input
						type="checkbox"
						class="gateway-facet__checkbox"
						id="<?php echo esc_attr( $field_id . '-default' ); ?>"
						value="<?php echo esc_attr( $default_value ); ?>"
						checked
					/>
					<?php echo esc_html( $default_label ); ?>
				</label>
			<?php endif; ?>
			<?php foreach ( $facet_options as $index => $option ) : ?>
				<label class="gateway-facet__checkbox-label">
					<input
						type="checkbox"
						class="gateway-facet__checkbox"
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
