<?php
/**
 * Turns a gateway/data-cards-body block's authored card template (its own
 * InnerBlocks -- arbitrary user-authored content, e.g. core Post Title/
 * Post Featured Image/Post Excerpt blocks) into one rendered `<li>` per
 * matched post, plus the WP_Query args and pager metadata gateway/
 * data-cards-body's render.php and Data_Cards_REST_Controller both need.
 *
 * The per-post rendering trick (render_items() below) is a direct port of
 * WordPress core's own render_block_core_post_template() -- confirmed by
 * reading packages/block-library/src/post-template/index.php in a
 * `caseyjmilne/gutenberg` checkout: swap the wrapping block's name to an
 * unregistered one ('core/null') so re-rendering it doesn't re-trigger
 * this block's own supports/wrapper processing, inject 'postId'/'postType'
 * into block context via an early-priority 'render_block_context' filter
 * scoped to exactly one WP_Block::render() call, then restore the real
 * post/query global state afterwards. Every core block that reads post
 * data by context (Post Title, Post Featured Image, ...) -- and any
 * template tag that instead reads it off the global $post/$wp_query the
 * normal WordPress Loop way -- resolves correctly either way, because
 * $query->the_post() is called on every iteration, exactly as core does.
 *
 * A pure static helper, not a hook-owning service like Column_Registry/
 * Facet_Query/Columns_REST_Controller -- nothing here needs to run on its
 * own, so it has no init() and gateway.php only ever require_once's it.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Data_Cards_Renderer {

	/**
	 * Page-size choices offered alongside a block's own configured Page
	 * Size -- mirrors blocks/shared/datatable.js's buildLengthMenu(), so
	 * both grid types offer the same shape of choice list.
	 */
	const DEFAULT_LENGTH_MENU = array( 10, 25, 50, 100 );

	/**
	 * The current gateway/data-cards instance's already-computed initial
	 * render state ('html', pager meta, 'template_id', 'rest_url') --
	 * a scratch slot exactly analogous to WordPress' own global $post/
	 * $wp_query: gateway/data-cards-body, -pagination, -results, and
	 * -page-size are independently-dispatched SIBLING blocks (all children
	 * of gateway/data-cards, each rendered via its own $inner_block->render()
	 * call -- see gateway/data-cards/render.php), and WordPress block
	 * context only ever flows from ancestor to descendant, never sideways
	 * between siblings. Running the same WP_Query redundantly in each of
	 * Body/Pagination/Results' own render.php would work, but at the cost
	 * of the exact "PHP renders real state up front" benefit this class
	 * exists for -- so gateway/data-cards/render.php (the one common
	 * ancestor) computes this ONCE, stores it here immediately before
	 * dispatching its children, and clears it immediately after -- never
	 * left set across requests or left dangling for a nested/later instance.
	 *
	 * @var array|null
	 */
	protected static $current = null;

	/**
	 * Set the current instance's computed state -- called by gateway/
	 * data-cards/render.php right before dispatching its children.
	 *
	 * @param array $state { html, page, pages, start, end, recordsDisplay,
	 *                       recordsTotal, template_id, rest_url }.
	 */
	public static function set_current( array $state ) {
		self::$current = $state;
	}

	/**
	 * @return array|null The current instance's state, or null if called
	 *                     outside a gateway/data-cards render (e.g. gateway/
	 *                     data-cards-body rendered standalone via the block
	 *                     -renderer REST endpoint, moved out from under its
	 *                     parent, or any other context this class can't
	 *                     assume away).
	 */
	public static function get_current() {
		return self::$current;
	}

	/**
	 * Clear the current instance's state -- called by gateway/data-cards/
	 * render.php right after dispatching its children, so it never leaks
	 * into a later, unrelated gateway/data-cards instance on the same page.
	 */
	public static function clear_current() {
		self::$current = null;
	}

	/**
	 * Build the WP_Query args for one page of a Data Cards grid.
	 *
	 * `$page` is zero-based throughout this whole class (and the REST
	 * route), matching DataTables' own `page.info().page` convention that
	 * gateway/pagination's existing getPageWindow()/attachPagination()
	 * logic already assumes -- WP_Query's native `paged` is 1-based, so
	 * the +1 conversion happens here, once, rather than at every call site.
	 *
	 * @param string $post_type Post type slug.
	 * @param int    $page      Zero-based page index.
	 * @param int    $page_size Items per page.
	 * @param string $search    Free-text search term, or '' for none.
	 * @return array WP_Query arguments.
	 */
	public static function get_query_args( $post_type, $page, $page_size, $search = '' ) {
		$query_args = array(
			'post_type'      => $post_type,
			'post_status'    => 'publish',
			'posts_per_page' => max( 1, (int) $page_size ),
			'paged'          => max( 0, (int) $page ) + 1,
			// Server-side pagination needs a real found_posts/max_num_pages,
			// unlike gateway/datatable-body's WP_Query (no_found_rows=true
			// there, since DataTables paginates client-side over one
			// already-fetched full result set).
			'no_found_rows'  => false,
		);

		if ( '' !== $search ) {
			$query_args['s'] = $search;
		}

		/**
		 * Filters the WP_Query arguments used to populate a Data Cards grid.
		 *
		 * @param array  $query_args WP_Query arguments.
		 * @param string $post_type  Post type slug.
		 * @param int    $page       Zero-based page index.
		 * @param int    $page_size  Items per page.
		 * @param string $search     Free-text search term, or '' for none.
		 */
		return apply_filters( 'gateway_data_cards_query_args', $query_args, $post_type, $page, $page_size, $search );
	}

	/**
	 * Build the record page + pager metadata for one page of a Collection
	 * -sourced Data Cards grid -- the Eloquent counterpart to
	 * get_query_args()/build_pager_meta() above, combined into one call
	 * since (unlike WP_Query, which computes found_posts as a side effect
	 * of running the query once) an Eloquent Builder needs a genuinely
	 * separate ->count() before the paginated ->get(), so both are done
	 * together here rather than asking every caller to sequence them
	 * correctly themselves.
	 *
	 * No search support yet for a Collection -- Eloquent has no equivalent
	 * to WP_Query's own `s` full-text search built in, and building one
	 * (which field(s) to search, how to weight them) is real, separate,
	 * undone work. Facets ARE supported (`$facets`, validated the same
	 * defensive way as the postType path -- see Facet_Query::
	 * validate_facets()/apply_collection_facets()), applied here after the
	 * extensibility filter below so a site's own query narrowing and a
	 * visitor's own facet choices compose the same way the postType path's
	 * `get_query_args()` + `apply_facets()` already do.
	 *
	 * @param string $collection      Model class name.
	 * @param int    $page            Zero-based page index.
	 * @param int    $page_size       Items per page.
	 * @param int    $limit           Block's configured Limit (0 = no cap).
	 * @param array  $facets          Validated facets (Facet_Query::validate_facets()'s own shape), or [] for none.
	 * @param array  $template_blocks Parsed card template blocks -- walked to find which
	 *                                 related fields (Column_Registry::get_related_columns_for_collection())
	 *                                 a gateway/card-field-text block actually needs, so the
	 *                                 corresponding relationship can be eager-loaded here
	 *                                 rather than lazy-loaded (an N+1 query per record) once
	 *                                 render_items_for_collection() gets to it.
	 * @return array { records: \Illuminate\Support\Collection, pager_meta: array }
	 */
	public static function get_collection_page( $collection, $page, $page_size, $limit, array $facets = array(), array $template_blocks = array() ) {
		$query = $collection::query()->orderBy( 'id', 'desc' );

		$related_relationships = self::collect_related_field_relationships( $collection, $template_blocks );

		if ( ! empty( $related_relationships ) ) {
			$query->with( $related_relationships );
		}

		/**
		 * Filters the Eloquent query builder used to populate a Data Cards
		 * grid when its data source is a Collection. Same purpose as
		 * `gateway_data_cards_query_args` has for the postType branch.
		 *
		 * @param \Illuminate\Database\Eloquent\Builder $query      Query builder.
		 * @param string                                 $collection Model class name.
		 */
		$query = apply_filters( 'gateway_data_cards_collection_query', $query, $collection );
		$query = Facet_Query::apply_collection_facets( $query, $facets );

		$found         = (int) $query->count();
		$page_size     = max( 1, (int) $page_size );
		$records_total = $limit > 0 ? min( (int) $limit, $found ) : $found;
		$pages         = (int) ceil( $records_total / $page_size );

		if ( 0 === $records_total ) {
			return array(
				'records'    => collect(),
				'pager_meta' => array(
					'page'           => 0,
					'pages'          => 0,
					'start'          => 0,
					'end'            => 0,
					'recordsDisplay' => 0,
					'recordsTotal'   => 0,
				),
			);
		}

		$page  = max( 0, min( (int) $page, $pages - 1 ) );
		$start = $page * $page_size;
		$end   = min( $records_total, $start + $page_size );

		// How many of this page's up-to-$page_size rows the block's Limit
		// setting still allows -- same "how much of this page is still
		// under the cap" arithmetic render_items() already does for posts,
		// applied here to a plain ->skip()/->take() instead of WP_Query's
		// own posts_per_page/paged.
		$take = $end - $start;

		$records = $take > 0
			? ( clone $query )->skip( $start )->take( $take )->get()
			: collect();

		return array(
			'records'    => $records,
			'pager_meta' => array(
				'page'           => $page,
				'pages'          => $pages,
				'start'          => $start,
				'end'            => $end,
				'recordsDisplay' => $records_total,
				'recordsTotal'   => $records_total,
			),
		);
	}

	/**
	 * Walks a card template's parsed blocks (recursively -- a
	 * gateway/card-field-text block could sit inside a row/column layout
	 * block, not just directly under gateway/data-cards-body) for every
	 * gateway/card-field-text block's own `fieldKey`, and returns the
	 * distinct relationship method name(s) (Column_Registry::
	 * get_related_columns_for_collection()'s own `relationship_method`)
	 * any of them actually reference -- what get_collection_page() eager
	 * -loads before render_items_for_collection() renders a single card.
	 *
	 * @param string $collection      Model class name.
	 * @param array  $template_blocks Parsed card template blocks.
	 * @return string[] Distinct relationship method names, [] if none of
	 *                    the template's fields are related fields.
	 */
	private static function collect_related_field_relationships( $collection, array $template_blocks ) {
		if ( empty( $template_blocks ) ) {
			return array();
		}

		$relationship_by_key = array();

		foreach ( Column_Registry::get_related_columns_for_collection( $collection ) as $related_column ) {
			$relationship_by_key[ $related_column['key'] ] = $related_column['relationship_method'];
		}

		if ( empty( $relationship_by_key ) ) {
			return array();
		}

		$relationships = array();

		$walk = static function ( array $blocks ) use ( &$walk, &$relationships, $relationship_by_key ) {
			foreach ( $blocks as $inner_block ) {
				if ( 'gateway/card-field-text' === ( $inner_block['blockName'] ?? '' ) ) {
					$field_key = $inner_block['attrs']['fieldKey'] ?? '';

					if ( is_string( $field_key ) && isset( $relationship_by_key[ $field_key ] ) ) {
						$relationships[ $relationship_by_key[ $field_key ] ] = true;
					}
				}

				if ( ! empty( $inner_block['innerBlocks'] ) ) {
					$walk( $inner_block['innerBlocks'] );
				}
			}
		};

		$walk( $template_blocks );

		return array_keys( $relationships );
	}

	/**
	 * Render one `<li>` per matched record, running the given card template
	 * against each record's own block context -- the Collection counterpart
	 * to render_items() below, for a Data Cards grid whose data source is a
	 * Gateway model instead of a post type.
	 *
	 * There's no WordPress Loop/global $post equivalent to restore here
	 * (Eloquent records aren't posts) -- the whole per-item mechanism is
	 * just the render_block_context injection, unlike render_items()'s own
	 * extra the_post()/wp_reset_postdata() bookkeeping.
	 *
	 * The actual Eloquent model instance is injected into context under
	 * the plain (unnamespaced) key 'record' -- matching how core's own
	 * 'postId'/'postType' context keys aren't namespaced either -- so any
	 * descendant block (gateway/card-field-text, or a future field-display
	 * block) can declare `"usesContext": ["record"]` and read
	 * `$block->context['record']` directly. Passing the instance itself,
	 * not just its id, means every field-display block within the same
	 * card shares the one record already fetched here rather than each
	 * re-querying it independently.
	 *
	 * Reused as-is by `gateway/related-items/render.php` for the exact
	 * same reason -- rendering one card template per record, injecting
	 * that one record into `'record'` context -- just with a different
	 * `$records` source (a record's own `hasMany`/`belongsToMany`
	 * relation instead of a top-level query) and a different `$item_class`
	 * (so a nested related-items list never carries the outer grid's own
	 * `gateway-data-cards-grid__item` class, which a site's own CSS
	 * targeting that class shouldn't also match).
	 *
	 * @param \Illuminate\Support\Collection $records         Records for the current page (get_collection_page()'s own 'records').
	 * @param array                          $template_blocks Parsed block list (the card's contents).
	 * @param string                         $item_class      CSS class for each wrapping `<li>`.
	 * @return string Concatenated `<li>` markup, '' if nothing to render.
	 */
	public static function render_items_for_collection( $records, array $template_blocks, $item_class = 'gateway-data-cards-grid__item' ) {
		if ( empty( $template_blocks ) || 0 === count( $records ) ) {
			return '';
		}

		$wrapper_block = array(
			'blockName'    => 'core/null',
			'attrs'        => array(),
			'innerBlocks'  => $template_blocks,
			'innerHTML'    => '',
			'innerContent' => array_fill( 0, count( $template_blocks ), null ),
		);

		$content = '';

		foreach ( $records as $record ) {
			$filter_block_context = static function ( $context ) use ( $record ) {
				$context['record'] = $record;
				return $context;
			};

			add_filter( 'render_block_context', $filter_block_context, 1 );
			$item_content = ( new \WP_Block( $wrapper_block ) )->render( array( 'dynamic' => false ) );
			remove_filter( 'render_block_context', $filter_block_context, 1 );

			$content .= '<li class="' . esc_attr( $item_class ) . '">' . $item_content . '</li>';
		}

		return $content;
	}

	/**
	 * Render one `<li>` per matched post, running the given card template
	 * against each post's own block context.
	 *
	 * @param \WP_Query $query           An already-run WP_Query for the current page.
	 * @param array     $template_blocks Parsed block list (e.g. $block->parsed_block['innerBlocks'],
	 *                                   or parse_blocks() of a stored template string) -- the card's contents.
	 * @param int       $limit           Block's configured Limit (0 = no cap).
	 * @param int       $page            Zero-based page index (see get_query_args()).
	 * @param int       $page_size       Items per page.
	 * @return string Concatenated `<li>` markup, '' if nothing to render.
	 */
	public static function render_items( \WP_Query $query, array $template_blocks, $limit, $page, $page_size ) {
		if ( empty( $template_blocks ) || ! $query->have_posts() ) {
			return '';
		}

		// How many more items the block's Limit setting allows on this page
		// -- e.g. limit=25/pageSize=10/page=2 (zero-based) has already shown
		// 20, so only 5 of this page's up-to-10 fetched posts may render.
		$max_remaining = $limit > 0 ? max( 0, (int) $limit - ( (int) $page * (int) $page_size ) ) : null;

		// A single synthetic wrapper block, reused for every post: an
		// unregistered blockName ('core/null') means WP_Block resolves no
		// block_type for it, so ->render() falls through to concatenating
		// innerContent/innerBlocks raw, with no render_callback or block
		// -supports wrapper of its own -- exactly what
		// render_block_core_post_template() relies on when it swaps its
		// OWN $block->parsed_block['blockName'] the same way. Built once
		// here (not per post) since $template_blocks doesn't change across
		// iterations; only the render_block_context filter varies.
		$wrapper_block = array(
			'blockName'    => 'core/null',
			'attrs'        => array(),
			'innerBlocks'  => $template_blocks,
			'innerHTML'    => '',
			'innerContent' => array_fill( 0, count( $template_blocks ), null ),
		);

		$content = '';
		$count   = 0;

		while ( $query->have_posts() && ( null === $max_remaining || $count < $max_remaining ) ) {
			// Real WordPress Loop state (global $post, get_the_ID(), etc.) --
			// not just the block-context injection below -- since arbitrary
			// content dropped into the template (a shortcode, a block that
			// reads template tags instead of context) may depend on it.
			// Matches render_block_core_post_template()'s own reasoning
			// ("it's safest to always restore").
			$query->the_post();

			$post_id   = get_the_ID();
			$post_type = get_post_type();

			$filter_block_context = static function ( $context ) use ( $post_id, $post_type ) {
				$context['postId']   = $post_id;
				$context['postType'] = $post_type;
				return $context;
			};

			// Early priority so other render_block_context filters still
			// see these values -- matches core's own priority-1 usage.
			add_filter( 'render_block_context', $filter_block_context, 1 );
			$item_content = ( new \WP_Block( $wrapper_block ) )->render( array( 'dynamic' => false ) );
			remove_filter( 'render_block_context', $filter_block_context, 1 );

			$post_classes = implode( ' ', get_post_class( 'gateway-data-cards-grid__item' ) );

			$content .= '<li class="' . esc_attr( $post_classes ) . '">' . $item_content . '</li>';

			++$count;
		}

		// Restores template tags to whatever loop (if any) was running
		// before this one -- always, per the same reasoning as above: two
		// nested custom loops make this the safe default, not an optimization.
		wp_reset_postdata();

		return $content;
	}

	/**
	 * Build pager metadata for a rendered page -- deliberately the same
	 * field names (and zero-based `page`) as DataTables' own
	 * `dataTable.page.info()`, so blocks/shared/pagination-window.js's
	 * getPageWindow() and blocks/shared/results-text.js's buildInfoText()
	 * work against this unmodified, with zero shape/base translation.
	 *
	 * @param \WP_Query $query     An already-run WP_Query for the current page.
	 * @param int       $page      Zero-based page index requested.
	 * @param int       $page_size Items per page.
	 * @param int       $limit     Block's configured Limit (0 = no cap).
	 * @return array { page, pages, start, end, recordsDisplay, recordsTotal }
	 */
	public static function build_pager_meta( \WP_Query $query, $page, $page_size, $limit ) {
		$found         = (int) $query->found_posts;
		$records_total = $limit > 0 ? min( (int) $limit, $found ) : $found;
		$page_size     = max( 1, (int) $page_size );
		$pages         = (int) ceil( $records_total / $page_size );

		if ( 0 === $records_total ) {
			return array(
				'page'           => 0,
				'pages'          => 0,
				'start'          => 0,
				'end'            => 0,
				'recordsDisplay' => 0,
				'recordsTotal'   => 0,
			);
		}

		$page  = max( 0, min( (int) $page, $pages - 1 ) );
		$start = $page * $page_size;
		$end   = min( $records_total, $start + $page_size );

		return array(
			'page'           => $page,
			'pages'          => $pages,
			'start'          => $start,
			'end'            => $end,
			'recordsDisplay' => $records_total,
			'recordsTotal'   => $records_total,
		);
	}

	/**
	 * PHP port of blocks/shared/pagination-window.js's getPageWindow() --
	 * used only for gateway/data-cards-pagination's initial, server
	 * -rendered page-number buttons (see "PHP renders real state up
	 * front" in the README). Not shared with the JS version via any
	 * build step -- small and stable enough (~20 lines) that keeping two
	 * copies in their native languages is simpler than round-tripping
	 * through a data format, and this one is only ever used once, at
	 * render time, not on every fetched page the way the JS version is.
	 *
	 * @param int $current Current page index (zero-based).
	 * @param int $total   Total number of pages.
	 * @return array Page indexes (int), plus 'ellipsis-start'/'ellipsis-end' string markers.
	 */
	public static function build_page_window( $current, $total ) {
		$max_visible = 5;

		if ( $total <= 0 ) {
			return array();
		}

		if ( $total <= $max_visible + 2 ) {
			return range( 0, $total - 1 );
		}

		$half  = (int) floor( $max_visible / 2 );
		$start = max( 0, $current - $half );
		$end   = min( $total - 1, $start + $max_visible - 1 );
		$start = max( 0, $end - $max_visible + 1 );

		$pages = array();

		if ( $start > 0 ) {
			$pages[] = 0;

			if ( $start > 1 ) {
				$pages[] = 'ellipsis-start';
			}
		}

		for ( $page = $start; $page <= $end; $page++ ) {
			$pages[] = $page;
		}

		if ( $end < $total - 1 ) {
			if ( $end < $total - 2 ) {
				$pages[] = 'ellipsis-end';
			}

			$pages[] = $total - 1;
		}

		return $pages;
	}

	/**
	 * PHP port of blocks/shared/results-text.js's buildInfoText() -- used
	 * only for gateway/data-cards-results' initial, server-rendered
	 * summary text (see "PHP renders real state up front" in the README).
	 * Same wording as the JS version, for consistency across both grid
	 * types -- not shared via any build step, for the same reasoning as
	 * build_page_window()'s own docblock above.
	 *
	 * @param array $pager_meta { start, end, recordsDisplay, recordsTotal } (build_pager_meta()'s own shape).
	 * @return string The "Showing X to Y of Z entries" (or filtered/empty variant) text.
	 */
	public static function build_info_text( array $pager_meta ) {
		$records_display = (int) $pager_meta['recordsDisplay'];
		$records_total    = (int) $pager_meta['recordsTotal'];

		if ( 0 === $records_display ) {
			return sprintf(
				/* translators: 'entries' or 'entry'. */
				__( 'Showing 0 to 0 of 0 %s', 'gateway' ),
				_n( 'entry', 'entries', 0, 'gateway' )
			);
		}

		$text = sprintf(
			/* translators: 1: start, 2: end, 3: total, 4: 'entries' or 'entry'. */
			__( 'Showing %1$d to %2$d of %3$d %4$s', 'gateway' ),
			(int) $pager_meta['start'] + 1,
			(int) $pager_meta['end'],
			$records_display,
			_n( 'entry', 'entries', $records_display, 'gateway' )
		);

		if ( $records_display !== $records_total ) {
			$text .= ' ' . sprintf(
				/* translators: 1: total, 2: 'entries' or 'entry'. */
				__( '(filtered from %1$d total %2$s)', 'gateway' ),
				$records_total,
				_n( 'entry', 'entries', $records_total, 'gateway' )
			);
		}

		return $text;
	}

	/**
	 * PHP port of blocks/shared/datatable.js's buildLengthMenu() -- a
	 * choice list guaranteed to include the block's own configured Page
	 * Size, so gateway/data-cards-page-size's <select> (rendered here,
	 * server-side, unlike gateway/datatable-page-size which must wait for
	 * a live DataTables instance to ask) never offers a set of options
	 * that doesn't include the value the grid is actually showing.
	 *
	 * @param int $page_size Configured page size.
	 * @return int[] Sorted, deduplicated length menu.
	 */
	public static function build_length_menu( $page_size ) {
		$page_size = (int) $page_size;

		if ( $page_size <= 0 ) {
			return self::DEFAULT_LENGTH_MENU;
		}

		$menu = array_unique( array_merge( array( $page_size ), self::DEFAULT_LENGTH_MENU ) );
		sort( $menu, SORT_NUMERIC );

		return array_values( $menu );
	}
}
