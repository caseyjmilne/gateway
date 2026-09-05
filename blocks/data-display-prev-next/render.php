<?php
/**
 * Server-side render for the gateway/data-display-prev-next block.
 *
 * Unlike every other block in this plugin's own "PHP computes the real
 * state up front" family, this one deliberately renders inert placeholder
 * markup -- both links start `hidden`, with an empty `href`/title -- and
 * leaves the actual work to src/view.js. That's not a shortcut; it's the
 * only approach that actually fits gateway/data-display's own nature:
 * "which child is currently active" is PURELY a client-side,
 * `window.location.hash`-driven fact (see that block's own render.php/
 * view.js docblocks) that doesn't exist yet at PHP-render time -- this
 * block renders once per child (it lives inside Data Display's own
 * InnerBlocks template, looped by Data_Cards_Renderer::render_items_for_collection()
 * the same as every other field block placed there), so a PHP-computed
 * "previous/next" would need to already know which of those N renders is
 * the one a visitor's own hash will eventually pick -- information that
 * flatly doesn't exist yet.
 *
 * The actual technique, entirely in view.js: rather than re-deriving
 * "what comes before/after me" from scratch (a second, parallel
 * computation of the same ordering render.php's own $all_children/sidebar
 * loop already produced, with its own risk of drifting out of sync with
 * it), this block's own script reads the ALREADY-RENDERED sidebar menu
 * (`.gateway-data-display__child-link`, one per child, in the exact same
 * order Data Display's own render.php built it in) -- the menu is both
 * the single source of truth for ordering AND already carries each
 * child's own real hashbang `href` and real title as its own link text,
 * so "find my own position in that list, then use its immediate
 * neighbors' own href/text" is the whole algorithm, no separate slug or
 * label computation needed at all. See view.js's own docblock for the
 * exact mechanics (closest-panel lookup, sibling-menu-link lookup).
 *
 * A no-JS visitor never sees either link at all -- a known, accepted
 * consequence of Data Display's own hashbang-only navigation already
 * being entirely JS-dependent for "which child is showing" in the first
 * place (see that block's own render.php docblock); this isn't a new
 * regression this block introduces on its own.
 *
 * @package Gateway
 *
 * @var array    $attributes Block attributes (none currently).
 * @var string   $content    Inner block content (unused -- this is a leaf block).
 * @var WP_Block $block      Block instance.
 */

defined( 'ABSPATH' ) || exit;

$wrapper_attributes = get_block_wrapper_attributes( array( 'class' => 'gateway-data-display-prev-next' ) );
?>
<nav <?php echo $wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> aria-label="<?php esc_attr_e( 'Previous / Next', 'gateway' ); ?>">
	<a
		class="gateway-data-display-prev-next__link gateway-data-display-prev-next__link--prev"
		href="#"
		hidden
	>
		<span class="gateway-data-display-prev-next__direction"><?php esc_html_e( '← Previous', 'gateway' ); ?></span>
		<span class="gateway-data-display-prev-next__title"></span>
	</a>
	<a
		class="gateway-data-display-prev-next__link gateway-data-display-prev-next__link--next"
		href="#"
		hidden
	>
		<span class="gateway-data-display-prev-next__direction"><?php esc_html_e( 'Next →', 'gateway' ); ?></span>
		<span class="gateway-data-display-prev-next__title"></span>
	</a>
</nav>
