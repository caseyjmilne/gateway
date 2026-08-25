<?php
/**
 * Server-side render for the gateway/datatable block.
 *
 * Just a wrapper around exactly three named child blocks now -- gateway/
 * datatable-header, gateway/datatable-body, gateway/datatable-footer --
 * rendered in that fixed order. All the real work (resolving postType/
 * columns/facets, running the WP_Query, building the actual <table>) moved
 * into gateway/datatable-body's own render.php; this block's only job is to
 * find each named child among its inner blocks and echo it in the right
 * place. See gateway/datatable-body/render.php's docblock for why the table
 * itself is a sibling block rather than something rendered here directly:
 * in short, that's what makes the editor's InnerBlocks list (Header, Body,
 * Footer) visually match the front end's real order, rather than the table
 * showing up separately, below the InnerBlocks list, via <ServerSideRender>.
 *
 * `$content` (WordPress's own concatenation of every child's rendered
 * markup into ONE fixed spot) still isn't used, for the same reason as
 * before: three named zones around no hardcoded markup of this block's own
 * can't be represented by one flat string. `$block->inner_blocks` -- the
 * same already-instantiated, context-resolved child WP_Block instances
 * WordPress used to build that (here-unused) $content in the first place,
 * and a public property (confirmed against WordPress core's WP_Block
 * source) -- is rendered here instead, per child, keyed by name.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Unused -- see above.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$markup_by_name = array(
	'gateway/datatable-header' => '',
	'gateway/datatable-body'   => '',
	'gateway/datatable-footer' => '',
);

foreach ( $block->inner_blocks as $inner_block ) {
	if ( isset( $markup_by_name[ $inner_block->name ] ) ) {
		$markup_by_name[ $inner_block->name ] .= $inner_block->render();
	}
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-block' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php foreach ( $markup_by_name as $markup ) : ?>
		<?php if ( '' !== $markup ) : ?>
			<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each named child's own escaped output. ?>
		<?php endif; ?>
	<?php endforeach; ?>
</div>
