<?php
/**
 * Server-side render for the gateway/datatable block.
 *
 * A wrapper around three named child blocks -- gateway/datatable-header,
 * gateway/datatable-body, gateway/datatable-footer -- plus whatever a site
 * owner has placed in the "Facets" position above them, rendered in that
 * fixed order. All the real work (resolving postType/columns/facets,
 * running the WP_Query, building the actual <table>) lives in
 * gateway/datatable-body's own render.php; this block's only job is to
 * find each named child among its inner blocks and echo it in the right
 * place. See gateway/datatable-body/render.php's docblock for why the
 * table itself is a sibling block rather than something rendered here
 * directly: in short, that's what makes the editor's InnerBlocks list
 * visually match the front end's real order, rather than the table
 * showing up separately, below the InnerBlocks list, via <ServerSideRender>.
 *
 * The order below is the entire front-end contract: Facets above
 * everything (the interactive filter controls), Header next (Page Size +
 * Search, mirroring DataTables' own default `topStart`/`topEnd` row),
 * then the table itself, then Footer (Results + Pagination, mirroring
 * DataTables' own default `bottomStart`/`bottomEnd` row).
 *
 * Facets used to be its own named zone, `gateway/datatable-facets`, keyed
 * by name below exactly like Header/Body/Footer still are. That block was
 * removed entirely in favor of a plain, freely transformable `core/group`
 * (see README.md's "Preferring core blocks over bespoke containers" --
 * the same treatment gateway/data-cards-facets already got) -- but a bare
 * `core/group` has no fixed name of its own to key a lookup array by, and
 * a site owner is free to leave it as a Group, turn it into a Stack, or
 * anything else `templateLock: false` allows. So dispatch here is by
 * EXCLUSION instead of an exhaustive name-keyed lookup: Header/Body/Footer
 * still claim their own fixed slot by exact name; everything else --
 * whatever currently occupies the Facets position, whatever block type it
 * actually is -- renders first, above them, in its own natural relative
 * order (there's normally exactly one such child, but this doesn't assume
 * that). This also means any already-published content still carrying an
 * old, now-unregistered `gateway/datatable-facets` child keeps working
 * without a migration: its name simply doesn't match Header/Body/Footer
 * either, so it falls into the same "renders first" bucket it already
 * occupied.
 *
 * `$content` (WordPress's own concatenation of every child's rendered
 * markup into ONE fixed spot) still isn't used, for the same reason as
 * before: named zones around no hardcoded markup of this block's own
 * can't be represented by one flat string. `$block->inner_blocks` -- the
 * same already-instantiated, context-resolved child WP_Block instances
 * WordPress used to build that (here-unused) $content in the first place,
 * and a public property (confirmed against WordPress core's WP_Block
 * source) -- is rendered here instead, per child.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes.
 * @var string   $content    Unused -- see above.
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$facets_markup = ''; // Facets position -- whatever isn't one of the three fixed zones below.
$header_markup = '';
$body_markup   = '';
$footer_markup = '';

foreach ( $block->inner_blocks as $inner_block ) {
	if ( 'gateway/datatable-header' === $inner_block->name ) {
		$header_markup .= $inner_block->render();
	} elseif ( 'gateway/datatable-body' === $inner_block->name ) {
		$body_markup .= $inner_block->render();
	} elseif ( 'gateway/datatable-footer' === $inner_block->name ) {
		$footer_markup .= $inner_block->render();
	} else {
		$facets_markup .= $inner_block->render();
	}
}

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-datatable-block' ) );
?>
<div <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
	<?php foreach ( array( $facets_markup, $header_markup, $body_markup, $footer_markup ) as $markup ) : ?>
		<?php if ( '' !== $markup ) : ?>
			<?php echo $markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- each child's own escaped output. ?>
		<?php endif; ?>
	<?php endforeach; ?>
</div>
