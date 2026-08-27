# Gateway

A WordPress plugin for custom Gutenberg blocks, starting with a **Data Table**
block: a sortable, searchable grid of posts for any registered post type,
powered by [DataTables](https://datatables.net/).

## Requirements

- WordPress 6.3+
- PHP 8.2+ (raised from 7.4 by the vendored `illuminate/database` package --
  see "Laravel Models (Illuminate/Eloquent)" below)
- Node.js 18+ (build tooling only -- not required at runtime)

## Getting started

```bash
npm install
npm run build
```

Compiled assets are committed to the repo (`blocks/*/build/`), so the plugin
works immediately after activation even without running a build. Run
`npm run build` after changing anything under `blocks/*/src/`.

Available scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Clean + production build of every block. |
| `npm run start` | Watch mode for development. |
| `npm run clean` | Remove all `blocks/*/build` output. |
| `npm run format` | Format block source with `wp-scripts format`. |
| `npm run lint:js` | Lint block JS. |
| `npm run lint:css` | Lint block styles. |

## Architecture

```
gateway.php                     Plugin bootstrap: constants + boots Block_Loader, Column_Registry, Columns_REST_Controller, Facet_Query
includes/
  class-block-loader.php        Scans /blocks and register_block_type()'s every block found
  class-column-registry.php     Discovers columns (core fields + meta/ACF) for a post type; renders cell values
  class-columns-rest-controller.php  GET /gateway/v1/columns/<post_type> (the block editor's column/facet picker)
  class-facet-query.php         Applies validated facets to a WP_Query; distinct values for select/checkboxes facets
blocks/
  shared/                       Cross-block JS, NOT a block itself (no block.json -- webpack's glob skips it)
    datatable.js                Shared DataTables init/destroy helpers (jQuery + datatables.net-dt)
    dom.js                      Pure DOM helpers (getColumnIndexByKey) -- no jQuery/DataTables dependency
    wait-for-datatable.js       "Find the sibling table, wait for a DataTable, hide a native widget" (jQuery only)
    use-live-datatable-sync.js  Editor-only: keeps a live preview wired to the (possibly-replaced) sibling DataTable instance
    use-available-columns.js    Fetches the field list for a post type (shared by both blocks below)
  datatable/
    block.json                  Block metadata, attributes, providesContext, asset + render wiring
    render.php                  PHP render callback: just renders the facets/header/body/footer children, in that order
    src/
      index.js                  Editor registration (editorScript)
      edit.js                   Editor UI: InspectorControls + one self-healing InnerBlocks skeleton
      save.js                   Persists InnerBlocks content only -- render.php doesn't use it
      view.js                   Front-end entry (viewScript): finds tables, inits DataTables
      style.scss                Shared styles (front end + editor)
      controls/
        post-type-control.js    Reusable "Post Type" SelectControl
        limit-control.js        "Limit" numeric field
        page-size-control.js    "Page Size" numeric field
        columns-panel.js        Renders the two below for the selected columns
        facets-panel.js         Renders the two below for the selected facets
        available-columns-list.js  Click-to-toggle field selection (shared by columns + facets)
        column-config-table.js  Drag-to-reorder + click-to-toggle-sortable table
        facet-config-table.js   Drag-to-reorder table; "Default" button opens a modal with compare/value
        facet-compare-options.js  Facet comparison operator list (=, !=, >, ...)
      hooks/
        use-reconcile-field-list.js   Drops selections no longer valid for the current post type
        use-required-inner-blocks.js React hook: name-based self-heal for the 4 required children (see below)
    build/                      Compiled output (generated, do not hand-edit)
  datatable-facets/
    block.json                  Block metadata, parent restricting it to gateway/datatable
    render.php                  PHP render callback: echoes $content as-is (see "Header/body/footer" below)
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: an InnerBlocks area restricted to gateway/facet
      save.js                   Persists InnerBlocks content -- this block's own wrapper + classes
      view.js                   No front-end behavior -- exists only so style.scss gets built
      style.scss                Layout for facet children (flex row)
    build/                      Compiled output (generated, do not hand-edit)
  datatable-header/
    block.json                  Block metadata, parent restricting it to gateway/datatable
    render.php                  PHP render callback: echoes $content as-is (see "Header/body/footer" below)
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: an InnerBlocks area restricted to gateway/datatable-page-size + gateway/datatable-search
      save.js                   Persists InnerBlocks content -- this block's own wrapper + classes
      view.js                   No front-end behavior -- exists only so style.scss gets built
      style.scss                Layout for the page-size/search children (flex row, spread to opposite ends)
    build/                      Compiled output (generated, do not hand-edit)
  datatable-body/
    block.json                  Block metadata, attributes (mirrored context, SSR-preview fallback only), usesContext
    render.php                  PHP render callback: the actual <table> -- headings + rows -- moved here from datatable/render.php
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: mirrors context into attributes, then <ServerSideRender> + DataTables init
      save.js                   Persists nothing (leaf, dynamic block)
      hooks/
        use-datatable-init.js   React hook: (re)inits DataTables against an async-rendered container
    build/                      Compiled output (generated, do not hand-edit)
  datatable-footer/
    block.json                  Block metadata, parent restricting it to gateway/datatable
    render.php                  PHP render callback: echoes $content as-is (see "Header/body/footer" below)
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: an InnerBlocks area restricted to gateway/pagination + gateway/datatable-results
      save.js                   Persists InnerBlocks content -- this block's own wrapper + classes
      view.js                   No front-end behavior -- exists only so style.scss gets built
      style.scss                Layout for the pagination/results children
    build/                      Compiled output (generated, do not hand-edit)
  facet/
    block.json                  Block metadata, parent + usesContext restricting it to gateway/datatable-facets
    render.php                  PHP render callback: the input/select/checkboxes control
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: pick a facet + a UI type, with validity warnings
      view.js                   Front-end entry: hooks the control into the sibling DataTable instance
      style.scss                Facet control styles
      controls/
        facet-key-control.js    "Facet" select, from the parent's configured facets (context)
        ui-type-control.js      "UI Type" select: input / select / checkboxes
        compare-control.js      "Compare" select (Contains/Equals), Input UI type only
    build/                      Compiled output (generated, do not hand-edit)
  datatable-page-size/
    block.json                  Block metadata, parent restricting it to gateway/datatable-header
    render.php                  PHP render callback: an empty, disabled <select> skeleton
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: a *live* preview -- see "A live editor preview" below
      view.js                   Front-end entry: finds+waits for the table, hands off to attach-page-size.js
      attach-page-size.js       Shared option-populating/wiring logic, used by both edit.js and view.js
      style.scss                Page Size control styles
    build/                      Compiled output (generated, do not hand-edit)
  datatable-search/
    block.json                  Block metadata, parent restricting it to gateway/datatable-header
    render.php                  PHP render callback: a disabled search <input> skeleton
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: a static preview (no settings to configure)
      view.js                   Front-end entry: drives the sibling DataTable's search() API
      style.scss                Search control styles
    build/                      Compiled output (generated, do not hand-edit)
  pagination/
    block.json                  Block metadata, parent restricting it to gateway/datatable-footer
    render.php                  PHP render callback: an empty Prev/Next + page-number skeleton
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: a *live* preview -- see "Pagination and Results" below
      view.js                   Front-end entry: finds+waits for the table, hands off to attach-pagination.js
      attach-pagination.js      Shared button-building/wiring logic, used by both edit.js and view.js
      style.scss                Pagination control styles
    build/                      Compiled output (generated, do not hand-edit)
  datatable-results/
    block.json                  Block metadata, parent restricting it to gateway/datatable-footer
    render.php                  PHP render callback: an empty "Showing X to Y of Z entries" skeleton
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: a *live* preview -- see "A live editor preview" below
      view.js                   Front-end entry: finds+waits for the table, hands off to attach-results.js
      attach-results.js         Shared info-text-building logic, used by both edit.js and view.js
      style.scss                Results text styles
    build/                      Compiled output (generated, do not hand-edit)
```

### Block discovery / autoloading

`Block_Loader::register_blocks()` (hooked on `init`) globs every directory
under `/blocks` and calls `register_block_type()` on each one that has a
`block.json`. Nothing in PHP needs to change to add a new block -- drop a new
`blocks/<slug>/` directory in place (with its own `block.json`, `src/`, and
optional `render.php`) and it's picked up automatically. `webpack.config.js`
does the equivalent for the build: it globs `blocks/*/block.json` and wires
up `index.js`/`view.js` entries per block automatically, compiling each into
that block's own `build/` directory.

### Dynamic blocks, server-rendered

Every block in this plugin has no meaningful client-side `save()` markup
(each returns `null`, or -- for the three InnerBlocks wrappers -- persists
only the child delimiter comments). All markup -- on both the front end and
in the block editor -- comes from each block's own `render.php` via
`block.json`'s `"render"` field:

- **Front end:** WordPress calls `render.php` when the block is rendered in
  a post/page -- normal recursive block rendering, context and all.
- **Editor:** the one block whose editor preview needs to show real,
  server-computed content -- `gateway/datatable-body`, the actual
  `<table>` -- renders `<ServerSideRender block="gateway/datatable-body" />`,
  which calls that same `render.php` through the `block-renderer` REST
  endpoint. This guarantees the editor preview is never out of sync with
  what actually ships to the front end. (`gateway/datatable` itself doesn't
  use `<ServerSideRender>` at all any more -- see "Header/body/footer"
  below for why that moved.)

### Initializing DataTables inside the Gutenberg editor

This is the part worth calling out explicitly, since it's easy to get wrong:

1. `gateway/datatable-body`'s `edit.js` wraps its `<ServerSideRender>` output
   in a `ref`'d container and passes that ref to `useDataTableInit()`
   (`hooks/use-datatable-init.js`, living in this block now -- see
   "Header/body/footer" below).
2. Because `<ServerSideRender>` fetches and swaps in its markup outside
   React's normal render cycle, there's no prop change to key a `useEffect`
   off of. The hook instead uses a `MutationObserver` on the container to
   detect the moment a `<table class="gateway-datatable">` actually lands in
   the DOM (or changes, e.g. after switching Post Type), and (re)initializes
   DataTables against it via the shared helpers in `shared/datatable.js`.
3. **Editor iframe:** since WP 5.9, the block canvas renders inside an
   `<iframe>`. Block editor JS itself still executes in the top window (where
   `window.jQuery` lives, enqueued as WordPress core's `jquery` handle), while
   the DOM nodes it manages belong to the iframe's document. jQuery/DataTables
   operate on DOM nodes directly and don't require the node's owner document
   to match their own global `document`, so calling `$(table).DataTable()`
   from top-window code against an iframe-owned `<table>` works reliably --
   this is the standard technique for driving legacy jQuery plugins inside
   the block editor.
4. The frontend (`gateway/datatable`'s own `view.js`) uses the same
   `shared/datatable.js` helpers directly (no MutationObserver needed there,
   since the markup is present at `DOMContentLoaded`), so editor and front
   end always get identical DataTables behavior (sorting, searching/
   filtering, pagination, etc.) regardless of which block's PHP actually
   emitted the `<table>` -- `document.querySelectorAll('table.gateway
   -datatable')` doesn't care.
5. **Softening the refresh:** a settings change means the entire preview is
   swapped for fresh server-rendered markup -- an instant full repaint with
   no shared DOM state to CSS-transition between. `use-datatable-init.js`
   adds an `.is-refreshing` class to the preview container the moment a
   dependency changes (fading its opacity down via `style.scss`), and
   removes it once the fresh table has actually (re)initialized (fading back
   in) -- turning the hard cut into a brief, deliberate fade instead.
6. **Suppressing row-link navigation:** a cell like `post_title`'s links to
   the post's permalink (useful on the front end); clicking it in the
   editor would otherwise navigate away from the post being edited.
   `use-datatable-init.js` adds a delegated click listener, scoped
   specifically to links inside `<tbody>` (not the whole container -- so
   DataTables' own pagination controls, which render outside the `<table>`
   element entirely, are unaffected), that calls `preventDefault()`. This
   is a second, independent effect from the (re)init one above -- it uses
   event delegation, so it doesn't need to know about any specific table
   node, and is set up once rather than being torn down and recreated
   alongside every reinit. Since this hook is only ever used from `edit.js`,
   never `view.js`, the suppression is inherently editor-only.
7. **Suppressing DataTables' own default widgets, here too:** the front end
   relies on each dedicated replacement block's own `view.js` calling
   `hideNativeDataTableWidget()` after it finds a live DataTable instance
   (see "Suppressing DataTables' own default widgets" below) -- but
   `viewScript` bundles are front-end-only; none of them load inside the
   editor. Left alone, this block's own editor preview showed the full
   native pageLength/search/info/paging UI around its table, alongside the
   dedicated blocks' own placeholder previews elsewhere in the InnerBlocks
   tree -- reported as "results and pagination still shows in the body
   section... duplicate because we have our own version of these below in
   the footer", and it was a real duplicate, not a misreading: DataTables'
   own default widgets genuinely were rendering there, just never
   suppressed. `use-datatable-init.js` now calls
   `hideNativeDataTableWidget()` itself, for all four widget classes,
   immediately after `initGatewayDataTable()` succeeds -- unlike the front
   end (where each block only knows about, and suppresses, its own one
   widget), this is the one place with no per-block visibility into which
   of the four dedicated blocks exist elsewhere in the tree, so it
   suppresses all four unconditionally, matching the guarantee
   `useRequiredInnerBlocks()`/`template` already make: every real
   `gateway/datatable` instance always has all four.

### Settings

- **Post Type** (`postType` attribute, default `post`): a `SelectControl`
  (`controls/post-type-control.js`) populated from `wp.data.select('core')
  .getPostTypes({ context: 'edit' })`, filtered to `viewable` post types
  (`viewable` is only exposed in the REST `edit` context) and with WP's
  internal non-content post types (`wp_block`, `wp_template`, ...) excluded.
  `render.php` re-checks the value with `post_type_exists()` and falls back
  to `post` -- never trust the attribute blindly server-side.
- **Limit** (`limit` attribute, default `0`): a numeric field
  (`controls/limit-control.js`) capping how many items the query fetches;
  `0` means no limit. Only non-negative integers are accepted -- invalid or
  negative input resets to `0` on blur. `render.php` re-sanitizes the value
  with `absint()` and only applies it (`posts_per_page`) when greater than
  `0`, so a tampered or malformed attribute can't produce a broken query.
- **Page Size** (`pageSize` attribute, default `10`): a numeric field
  (`controls/page-size-control.js`) mapped to DataTables' `pageLength`
  option -- how many rows are shown per page. Only positive integers are
  accepted; invalid or non-positive input falls back to `10` on blur.
  Unlike Limit, this doesn't affect how many rows are *fetched* (that's
  still governed by Limit) -- it only controls how many of them DataTables
  shows per page at once. `render.php` re-sanitizes the value with
  `absint()` and writes it onto the table as `data-page-size`;
  `shared/datatable.js` reads that attribute (in both the editor and on
  the front end) to set `pageLength`, and also folds the value into the
  "Show X entries" `lengthMenu` dropdown so it never displays a page-size
  option that isn't actually selected.

- **Columns** (`columns` attribute, default `[{ key: 'ID', sortable: true },
  { key: 'post_title', sortable: true }]`): which fields show up as columns,
  in what order, and which of them are client-side sortable in DataTables.
  See "Column selection" below.
- **Facets** (`facets` attribute, default `[]`): which fields the query is
  filtered by, in what order, with what comparison and value. See "Facet
  selection (filtering)" below.

The query args used to populate the grid are filterable via the
`gateway_datatable_query_args` PHP filter (`$query_args, $attributes,
$block`) for per-site customization (e.g. enforcing a hard cap on
`posts_per_page` regardless of the block's own Limit setting, changing
`orderby`).

### Column selection

Columns are configured in a dedicated "Columns" Inspector panel, appearing
once a Post Type is chosen, in two parts:

1. **Available columns** (`controls/available-columns-list.js`): every
   column available for the selected post type, grouped into "Fields" (core
   `WP_Post` properties) and "Custom Fields" (post meta, including ACF
   fields). Per spec, there are no checkboxes/radios -- clicking a column's
   name selects it (added to the end of `columns`); clicking an already
   selected name deselects it. At least one column must stay selected, so
   the last remaining one can't be clicked off.
2. **Column configuration** (`controls/column-config-table.js`): the
   currently *selected* columns, in their configured order, as a table with:
   - A drag handle (⠿) to reorder rows via plain HTML5 drag-and-drop --
     `columns` is just reordered in place on drop. `draggable` (and
     `onDragStart`) live on the handle cell specifically, not the `<tr>`,
     so a drag can only be started from the handle -- not by grabbing
     anywhere else in the row, which matters more once a row has its own
     interactive controls to click/select text in (as facet rows below
     do). (This UI lives in the Inspector sidebar, i.e. the editor's
     top-level document, not the iframed canvas, so there's no
     cross-iframe drag-and-drop concern to work around here, unlike the
     DataTables init below.)
   - A "Sortable" button per row, toggling whether that column is
     client-side sortable in DataTables.
   - A remove ("×") button per row, for deselecting a column from directly
     within the config table -- an alternative to clicking it off again in
     the available-columns list above. Both paths share the same "keep at
     least one column" guard (`ColumnsPanel`'s `handleRemove`), and the
     button is disabled rather than a silent no-op when it's the last one.

`controls/columns-panel.js` orchestrates both: it fetches the available
column list from **`GET /gateway/v1/columns/<post_type>`**
(`includes/class-columns-rest-controller.php`, requiring the current user be
able to edit that post type) whenever Post Type changes, and reconciles the
existing `columns` selection against the new list -- columns (typically
meta fields) that don't exist for the newly selected post type are dropped,
falling back to the default `ID`/`post_title` selection if that empties it.

**Where columns actually come from** (`includes/class-column-registry.php`,
`Column_Registry`), used by both the REST route and `render.php`:

- **Core fields**: a static, filterable (`gateway_datatable_core_columns`)
  map of `WP_Post` properties to friendly labels (`post_title` → "Title",
  `post_content` → "Content", etc.).
- **Featured Image**: offered only when the post type actually supports it
  (`post_type_supports( $post_type, 'thumbnail' )` -- the same theme
  -support opt-in core itself checks before showing the Featured Image
  panel in the editor at all), so a post type that can't have one never
  shows a column that would just always be empty. Its own `type`
  (`'thumbnail'`) is deliberately distinct from `'core'` -- it's the one
  column `get_cell_value()` returns pre-rendered, pre-escaped `<img>`
  markup for (`get_the_post_thumbnail( $post_id, 'thumbnail', ... )`,
  capped to 48×48 with `object-fit: cover` -- `blocks/datatable/src/
  style.scss` -- since WordPress' registered `'thumbnail'` size defaults
  to 150×150, sized for content, not a compact grid row) instead of a
  plain string, and `render.php`'s cell loop `echo`s that markup directly
  rather than through `esc_html()` -- which would print the tag as
  literal text instead of rendering the image. `AvailableColumnsList`
  groups it into "Fields" (same list as Title/Status/Date/etc.) rather
  than its own group, since it reads as a normal post-level field to a
  site owner picking columns even though its `type` differs internally.
  Sorting has no text to compare (the cell holds an image, not a string),
  so each `<td>` also carries a `data-order` attribute (the attachment
  ID) -- DataTables reads that over a cell's own content when present, so
  the column sorts by a real, stable value instead of every row
  comparing equal. That numeric `data-order` value has a side effect,
  though: it's also what DataTables infers a column's *type* from, so
  Featured Image got classified `dt-type-numeric` -- the same class a
  genuinely numeric column like "ID" gets -- and that class carries its
  own header layout in `datatables.net-dt`'s default CSS, moving the sort
  icon to the *left* of the title (see "Sort icons, header titles, and
  cell content" below for the fix, which applies to every column, not
  just this one).
  Excluded from the Facets panel entirely
  (`facets-panel.js`): filtering by which rows happen to have a
  particular image has no coherent meaning, and `Facet_Query::
  apply_facets()` has no branch for it anyway (neither meta, taxonomy,
  nor a real `wp_posts` column), so a facet for it would validate and
  save but silently filter nothing -- confusing, not just unhelpful.
- **Taxonomies** (categories, tags, and any custom taxonomy): every
  taxonomy registered for the post type (`get_object_taxonomies()`) that's
  `public` -- filterable via `gateway_datatable_taxonomy_columns` for sites
  that want a non-public one included deliberately. Unlike meta, this is a
  pure registration lookup with no "in use" sampling or cache-staleness
  concern, since taxonomy registration is static. A cell's value is its
  post's term **names**, comma-joined (`get_the_terms()`); for facet
  filtering, `Facet_Query` uses term **slugs** instead (see below).
- **Meta fields** (including ACF, or any other field-builder plugin): the
  union of formally registered meta (`get_registered_meta_keys()` -- what
  `register_post_meta()`, and ACF's own "Show in REST API" support, produce)
  and meta keys actually found in use on a recent sample of that post
  type's posts (`get_used_meta_keys()` -- to also surface fields, including
  ACF's, that were never formally registered, which is the common case).
  Registered meta is looked up under *both* the specific post type's
  subtype and the empty (`''`) subtype: `get_registered_meta_keys()` does
  an exact match, and meta registered without a specific post type (i.e.
  applying to every post type) is filed under the empty subtype -- missing
  that second lookup would make such a key invisible even though it's
  genuinely, formally registered.
  This is deliberately WordPress core APIs only -- no plugin's own API
  (ACF's included) is ever called directly, so discovery works identically
  whether or not ACF (or any specific field-builder plugin) is active, with
  nothing that can fault if it isn't. The "meta actually in use" scan is
  itself built entirely from core APIs too, rather than a hand-written SQL
  query: `get_posts()` picks the sample (most recently modified first,
  capped at 200 by default, filterable via
  `gateway_datatable_meta_scan_sample_size`), `update_meta_cache()` primes
  it in one batched query, then `get_post_meta( $post_id )` per post reads
  that post's full set of meta keys straight from the now-primed cache. A
  key that exists solely on posts outside the sample window won't surface
  until one of them is next saved -- an acceptable, standard trade-off for
  keeping this cheap enough to run from an admin screen, and one that
  narrows on its own as any of a type's posts get edited over time.
  Excluded: protected/internal keys (WordPress' `_`-prefixed convention --
  also how ACF stores its internal field-key references) via
  `is_protected_meta()`, plus a small, filterable
  (`gateway_datatable_excluded_meta_keys`) list of WordPress-internal meta
  that isn't underscore-prefixed but also isn't real content -- currently
  just `footnotes` (the block editor's Footnotes feature; WordPress core
  itself registers this meta key, with `show_in_rest`, for any post type
  supporting the block editor). Meta has no built-in "nice name," so labels
  are humanized from the raw key (`event_start_date` → "Event Start Date")
  by default, filterable via `gateway_datatable_column_label` for sites
  wanting real ACF field labels instead.

  Discovery results are cached per post type (`get_transient()`, 15 minutes
  by default, filterable via `gateway_datatable_columns_cache_ttl`) --
  but that's a ceiling, not the only way it gets refreshed:
  `Column_Registry::init()` hooks `save_post` to flush a post type's cached
  list on every save, so a custom field populated for the first time shows
  up as soon as that post is saved, not "eventually, once the cache happens
  to expire." The cache key itself also folds in a short hash of this
  file's own version/mtime (`get_cache_version()`), so a code change to the
  discovery logic (a bug fix, a new exclusion) invalidates every previously
  cached column list immediately -- a transient created under older logic
  has no other way to know it's now stale, since deploying new code doesn't
  by itself trigger `save_post` or wait out the TTL.

### Sort icons, header titles, and cell content: always left, never resized by a theme

`datatables.net-dt`'s own default stylesheet gives any column it
classifies as `dt-type-numeric`/`dt-type-date` (e.g. "ID") three things,
all meant to pair with that type's own right-aligned cell *content*: it
reverses the header's flex layout (title and sort icon swap sides), and
it sets `text-align: right` on the `<th>` *and* the `<td>` itself.
Surfaced by Featured Image (above): its `data-order` attachment ID,
needed for a real sort key since the cell holds an `<img>` rather than
text, is exactly what makes DataTables infer that same numeric type for
it too, even though nothing about how it *displays* is remotely numeric.

Each report generalized the fix a little further:

- **The icon side, first:** reported as "sorting icons appear on the left
  [for some columns] while on other columns they appear on the right...
  we want the sorting icons to always be on the right" -- one consistent
  side, regardless of a column's type, not a fix scoped to Featured Image
  specifically.
- **The title text shift, second:** even though the header is a flex
  container (`div.dt-column-header`, unaffected by `text-align` for its
  *own* layout), `text-align` is inherited, and `.dt-column-title` -- a
  plain text node inside that flex container -- still picks it up from
  the `<th>`, rendering shifted toward the right edge of its own
  (`flex-grow: 1`, otherwise-wide) box. A genuinely numeric/date *cell's*
  content is a real, right-aligned text node too, so it never looked
  mismatched there -- but Featured Image's cell is a `display: block`
  `<img>` (`.gateway-datatable-thumbnail` below), and block elements
  don't respond to a parent's `text-align` for their own position, so
  only the *heading* shifted right while the image underneath stayed
  flush left. Reported as "the image sits further left than its heading
  above," then confirmed as "it is the heading, not the content, that is
  misaligned."
- **The cell content itself, third:** once the "ID" heading was forced
  left, its actual numeric content ("8") stayed right-aligned inside its
  `<td>` -- `datatables.net-dt`'s `dt-type-numeric`/`dt-type-date` rule
  applies to cells too, not just headers -- so the two now visibly
  disagreed within the same column. Reported as "fix the alignment so
  content sits left even if it is numeric."

All three affect every column uniformly, not just Featured Image or ID: a
narrow column has had the identical inherited title-shift the whole time,
just imperceptible, since its `flex-grow: 1` title box has almost no
slack to visibly shift within -- it only became obvious once real numeric
cell content was compared directly against it.

`blocks/datatable/src/style.scss` forces all three directly:

```scss
table.gateway-datatable thead th div.dt-column-header {
	flex-direction: row !important;
}

table.gateway-datatable thead th,
table.gateway-datatable tbody td {
	text-align: left !important;
}
```

`!important` throughout because this overrides a third-party library's
own default rules -- the same reasoning the `width: 100%` rule above
already uses -- not fighting this plugin's own CSS, just guaranteeing
precedence over `datatables.net-dt`'s stylesheet regardless of load
order.

**Header text size:** also reported as rendering too large -- a theme's
own `table th` styling, sized for a handful of prose columns, not a
compact data grid. Normalized on `.dt-column-title` (the text node
itself, not the `<th>`/`div.dt-column-header` around it) to a fixed
16px with a 4px bottom margin, so the sort-icon glyph next to it
(`.dt-column-order`, already sized relative to its own `<th>` via
`datatables.net-dt`'s own `font-size: 0.8em`) scales down together with
it rather than being pinned to some other fixed size independently:

```scss
table.gateway-datatable thead th .dt-column-title {
	font-size: 16px !important;
	margin-bottom: 4px !important;
}
```

**Validation, and how columns reach DataTables:** `render.php` never trusts
the `columns` attribute blindly -- every requested `{ key, sortable }` is
checked against `Column_Registry::get_columns( $post_type )`, and anything
not on that list (a stale key from a since-changed post type, a hand-edited
attribute) is silently dropped; an empty result falls back to the same
`ID`/`post_title` default. Each valid column's value is resolved by
`Column_Registry::get_cell_value()` (core fields get type-appropriate
formatting -- e.g. `post_date` through `mysql2date()`, `post_content`
stripped of tags and trimmed to 20 words, `post_status` through its status
object's label; meta values are cast to a safe display string, JSON-encoding
arrays/objects). Every `<td>` also carries a `data-filter` attribute, from
the separate `Column_Registry::get_cell_filter_value()` -- DataTables
auto-detects `data-filter` on DOM-sourced cells and searches it instead of
the rendered HTML/text, for both the global search box and
`column().search()`, with no extra JS config needed. It exists because a
cell's *display* value often isn't its *raw* value: `post_title` displays
through `get_the_title()` inside an `<a>` tag, `post_author` displays a
name but is stored as an ID, `post_date` is formatted via `mysql2date()`,
`post_status` shows a label for a stored slug, and a taxonomy cell shows
term names though its facet options are built from term slugs. A Select
facet's `<option value>` always comes from the same raw/slug source
`get_facet_options()` uses (see below), so without `data-filter` an
exact-match search built from that value could fail to match its own
source cell -- `get_cell_filter_value()` closes that gap by combining the raw
value(s) with the display value into one searchable, comma-joined string
per cell, so both facets and the plain search box keep working off
whichever form a visitor is looking at. Column order in the rendered
`<thead>`/`<tbody>`
*is* DataTables' column order -- there's no separate mapping to keep in
sync. Each `<th>` also carries `data-orderable="true|false"` from the
column's `sortable` flag; `shared/datatable.js` reads those attributes and
builds DataTables' `columnDefs` option (selectively marking only the
non-orderable columns' `targets`, rather than a full `columns` array
enumerating every column) so a column's configured sortability is respected
identically in the editor and on the front end, with no per-caller wiring
needed. `columnDefs`/`targets` was a deliberate choice over the bare
`columns` array: DataTables requires that array to have exactly one entry
per header cell, and any mismatch is a documented failure condition --
worth avoiding here since it fails in the worst direction (falling back to
"every column orderable", silently discarding the configuration, rather
than visibly erroring). `columnDefs` has no such requirement, so it can only
ever fail toward *too* orderable, never toward silently ignoring the whole
setup.

`post_parent` ("Parent ID") is only offered as a core column for
hierarchical post types (pages, and any custom hierarchical CPT) --
`Column_Registry` excludes it via `is_post_type_hierarchical()` for flat
post types like `post`, where it isn't meaningful.

### Facet selection (filtering)

A second, independent Inspector panel -- "Facets" -- lets a block filter
its grid. The UI mirrors Columns deliberately:

- **`controls/facets-panel.js`** reuses `AvailableColumnsList` as-is (it
  was already generic over "a list of fields + a selection to toggle") for
  the click-to-toggle available-fields list -- but narrowed to only the
  fields already selected as *displayed* columns (`availableColumns`
  filtered against the `columns` attribute), not every filterable field
  `Column_Registry` knows about for the post type. A facet only has
  something to hook into once its field is also a displayed column (its
  DataTables column index is how the front end targets it -- see
  gateway/facet's `view.js`), so a field that isn't currently a column
  would just produce a facet with nothing to filter; restricting the list
  here prevents that state from being created in the first place, rather
  than only surfacing it after the fact via a warning. Unlike columns, an
  empty facet selection is a perfectly normal state (no filtering applied),
  so there's no "keep at least one" guard here.
- **`controls/facet-config-table.js`** is the selected-facets equivalent of
  `column-config-table.js`: same drag-and-drop reorder (native HTML5 DnD)
  and remove ("×") button, but instead of a Sortable toggle, each row
  carries one **Default** button, `isPressed` when the facet already has a
  value set. Clicking it opens a `<Modal>` with the **Compare** `<select>`
  (Equals, Not Equals, Greater/Less Than (or Equal), Contains, Does Not
  Contain -- `controls/facet-compare-options.js`) and **Value** `<input>`
  for that one facet, each given real room rather than squeezed into a
  table cell. Per the current spec, Value is a plain text field; loading a
  field's actual distinct values into a picker instead is a natural later
  step this structure doesn't block.
  - **Compare and Value used to be their own inline columns** -- reasonable
    for two short controls, but wide enough Compare labels ("Not Equals",
    "Greater Than or Equal") plus a Value input, alongside the Field
    column and the handle/remove columns either side, forced the whole
    table into horizontal scrolling in the Inspector sidebar's own
    (comparatively narrow) width. Moving both into a per-row modal
    -- opened on demand, not permanently competing for space -- fixes the
    width without losing anything: the row itself now stays exactly as
    narrow as "Field" + one button, regardless of how long a Compare label
    or Value gets.
- **`facets` attribute**: an ordered array of `{ key, compare, value }`,
  default `[]`.

Fetching the available field list and reconciling a selection against post
type changes were pulled out of `ColumnsPanel` and into two shared hooks --
`hooks/use-available-columns.js` and `hooks/use-reconcile-field-list.js` --
specifically so `FacetsPanel` could reuse both rather than duplicating a
second REST fetch and a second copy of the "drop what's no longer valid"
logic. `edit.js` now owns fetching the field list once per post type change
and runs the reconciliation hook twice: `columns` against `availableColumns`
(drops a selection that no longer exists for the post type, e.g. a meta
field specific to a previously selected one), and `facets` against
`columns` itself, not `availableColumns` -- so a facet is also dropped the
moment its column is removed from the display list, keeping every facet
valid against the same "is this a displayed column" rule the Facets panel's
toggle list enforces going forward. (Since `columns` is always already a
subset of `availableColumns` by the time its own reconciliation has run,
reconciling facets against `columns` is strictly the tighter of the two and
supersedes reconciling against `availableColumns` directly.)

**Applying facets to the query** (`render.php` +
`includes/class-facet-query.php`): each requested `{ key, compare, value }`
is validated the
same way columns are -- an unrecognized key for the post type is dropped,
and a facet with no value entered yet is skipped rather than querying for
an empty string. `Facet_Query::apply_facets()` then routes each valid facet
by its `type` (never trusted from the attribute -- always re-resolved from
`Column_Registry` in `render.php`, since a facet's `type` decides which of
three very different code paths it goes through):

- **Meta facets** become native `WP_Query` `meta_query` clauses --
  `compare` is passed straight through (it's already WP_Query's own
  vocabulary: `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `NOT LIKE`).
- **Taxonomy facets** become native `WP_Query` `tax_query` clauses,
  matching by term **slug**. Term membership is inherently binary, so
  `compare` only ever distinguishes `IN` (the default, and anything other
  than `!=`) from `NOT IN` -- the rest of the general compare vocabulary
  (`>`, `LIKE`, ...) has no coherent meaning for taxonomy terms.
  `controls/facet-config-table.js` restricts the Compare dropdown in that
  facet's own Default modal down to just Equals/Not Equals for a taxonomy
  facet, so a site owner never sees options that would be silently coerced
  anyway.
- **Core facets** (filtering by a `WP_Post` field like `post_title` or
  `post_date`) have no built-in `WP_Query` mechanism, so they're applied
  via a `posts_where` filter -- scoped to *only* queries that explicitly
  opt in via a private query var `apply_facets()` sets, so it can never
  affect any other query on the site. Both the column name and the compare
  operator are checked against fixed, non-filterable allow-lists
  (`Facet_Query::ALLOWED_CORE_COLUMNS`, `::ALLOWED_COMPARE`) before ever
  being placed into the raw SQL string -- the value is always passed
  through `$wpdb->prepare()`'s placeholder, never interpolated directly.
  This allow-list is deliberately *not* wired to the filterable
  `gateway_datatable_core_columns` list: it exists purely as a SQL-safety
  boundary, and letting arbitrary filtered-in column names widen it would
  defeat the point.

**Refreshing on column/facet changes:** `edit.js` includes
`JSON.stringify( columns )` and `JSON.stringify( facets )` in the
dependency array passed to `useDataTableInit()` (alongside `postType`,
`limit`, `pageSize`) -- selecting/deselecting a column or facet, reordering
either, toggling a column's sortable flag, or changing a facet's compare/
value all change one of those attributes, which re-renders
`<ServerSideRender>` with new markup, which the hook's `MutationObserver`
picks up to destroy and reinitialize DataTables. This is the "column/facet
change" event the DataTable refresh is keyed off of.

`useDataTableInit()` deliberately does *not* also sync immediately when a
dependency changes (only the `MutationObserver` triggers a (re)init). At the
instant a dep changes, the table still in the DOM is the *previous* render's
markup -- `<ServerSideRender>`'s refetch is asynchronous -- so syncing right
away would apply the new settings' effect (e.g. a just-toggled Sortable
flag) against stale markup that's about to be replaced anyway, which is
exactly the kind of "the change doesn't seem to take effect in the editor"
staleness this hook exists to prevent. The effect's cleanup still tears down
the current DataTable instance on every dependency change, so the table
sits in its plain, unenhanced state until the observer confirms the real
updated markup has landed and reinitializes against *that*.

## Facets: interactive front-end filtering (`gateway/facet` block)

`gateway/datatable` now accepts child blocks -- `gateway/facet`
(`block.json`'s `"parent": ["gateway/datatable-facets"]` restricts it to
only be insertable inside the Facets block documented below) -- that
render an interactive input/select/checkboxes control on the front end and
filter the grid live, client-side, as a visitor uses it. This is distinct
from the Facets *panel* documented above: that panel defines a *preset*
filter baked into the query (a facet with a fixed `value`); a
`gateway/facet` block turns one of those same presets into something a
site *visitor* can change.

### Discoverability via block context

"Discoverable by other scripts" -- any block nested inside a datatable
block, not just `gateway/facet` -- is `providesContext`/`usesContext`,
Gutenberg's native mechanism for a parent block exposing data to
descendants, in both JS and PHP:

- `gateway/datatable`'s `block.json` declares `"providesContext": {
  "gateway/datatable/postType": "postType", "gateway/datatable/limit":
  "limit", "gateway/datatable/pageSize": "pageSize",
  "gateway/datatable/columns": "columns", "gateway/datatable/facets":
  "facets" }` (`limit`/`pageSize` joined the other three once
  `gateway/datatable-body` needed them too -- see "`gateway/datatable-body`:
  the table, as a sibling block" below).
- `gateway/facet`'s `block.json` declares the matching `"usesContext"`
  (just the three it needs). In JS, `edit.js` reads it via the `context`
  prop React passes to a block with `usesContext` declared; in PHP,
  `render.php` reads the identical data via
  `$block->context['gateway/datatable/...']`.

No REST call, no prop-drilling through the block tree -- just the parent's
current attribute values, live, wherever a `usesContext` block needs them.

### Styling: font size and the field label

`block.json`'s `"supports": { "typography": { "fontSize": true } }` gives
`gateway/facet` the native font-size toolbar control (the same one core
blocks like Paragraph have) -- a site owner can pick a theme.json preset,
or a custom value, per facet instance. That control applies its chosen
size to the block's own top-level wrapper element: on the front end,
that's the exact `<div class="gateway-facet ...">` `render.php` already
builds via `get_block_wrapper_attributes()` (which automatically merges in
whatever class/inline style the typography support generates). `edit.js`
gives that same class to its own `useBlockProps()` element directly, for
the same reason: an earlier version put `gateway-facet` on a *separate*,
nested `<div>` instead (`FacetPreview`'s own wrapper, one level in from
`useBlockProps()`'s element) -- reported as "font resize only works on
the front end... isn't reading the actual [size] at all": with the
toolbar's chosen size landing on the outer `useBlockProps()` element and
`.gateway-facet`'s own explicit default (below) declared on that separate
inner one, the inner element's own rule always won over whatever the
outer one inherited, so nothing ever visibly changed in the editor. The
front end coincidentally worked regardless, since `render.php` only ever
had the one wrapper, not two -- the toolbar's style and `.gateway-facet`'s
class always landed on the very same element there, and an inline style
(what the toolbar produces) beats a class selector's rule outright.
`edit.js`'s preview content (`FacetPreviewContent`) no longer renders its
own wrapping `<div>` at all -- it renders directly inside `useBlockProps()`'s
element, matching `render.php`'s own one-wrapper structure.

`style.scss` sets `font-size: 16px` on `.gateway-facet` itself as the
*default* that control starts from -- previously unset, so the label
rendered however large whatever font-size happened to be ambient at that
point in a theme's own styles, which is what made it "appear very large"
with no Gateway styling actually setting a size at all. `&__label` (the
field's own caption, e.g. "Post Status") declares no `font-size` of its
own, specifically so it inherits whichever size is actually in effect --
this 16px default, or a site owner's override -- rather than being fixed
at one value regardless of that control; it keeps `font-weight: 600`
(semibold) independent of size, and `margin: 0 0 4px` (a fixed pixel
value, not `em`-relative -- so it stays exactly 4px regardless of which
font size ends up in effect, rather than scaling into a much larger gap
at a bigger chosen size).

### `gateway/datatable` growing InnerBlocks support

Making a previously-leaf dynamic block accept children required two real
changes, not just a JS tweak:

- **`save.js`** (new -- previously `save: () => null` inline in
  `index.js`): InnerBlocks content has to actually be *persisted* into
  `post_content` -- as nested `<!-- wp:gateway/datatable-facets ... /-->`
  -style block comments -- for WordPress to reconstruct the child block
  list on every later request. It uses `useInnerBlocksProps.save()` with no
  extra className -- deliberately *not* merged with `useBlockProps.save()`
  either, since that would apply block-support classes (align, spacing,
  ...) to this inner wrapper, which (see below) never actually reaches a
  visitor anyway.
- **`edit.js`**: `useInnerBlocksProps(blockProps, { allowedBlocks:
  REQUIRED_BLOCKS, template, templateLock: false })` renders one list --
  exactly four named container blocks (`gateway/datatable-facets`,
  `-header`, `-body`, `-footer`), in that fixed order, Header pre-populated
  with Page Size + Search and Footer with Pagination + Results. Two
  separate mechanisms cooperate to guarantee that: `template` seeds a
  brand-new, genuinely empty datatable block (Gutenberg only ever applies
  a `template` automatically while the list is empty, so it can't touch
  anything that already exists), and `useRequiredInnerBlocks()` (below)
  *repairs* an existing block that's missing a required child it didn't
  used to need -- see "Self-healing structure" below for why one mechanism
  can't safely cover both cases, and why they have to stay out of each
  other's way on that first, empty moment.
- **`render.php`**: renders the four named child blocks itself, rather
  than echo the `$content` it's normally handed -- `$content` is
  WordPress's own concatenation of every child's rendered markup into ONE
  fixed spot (wherever `save.js`'s InnerBlocks placeholder sits), which
  can't represent four named zones with no hardcoded markup of this
  block's own to interleave them around. `$block->inner_blocks` is the
  same set of already-instantiated, context-resolved child `WP_Block`
  instances WordPress used to build that (here-unused) `$content` in the
  first place -- a public property (confirmed against WordPress core's
  `WP_Block` source), so keying a lookup array by `$inner_block->name` and
  calling `$inner_block->render()` for each is legitimate public API, not
  a hack. It does mean each child renders twice per request (once, unused,
  to build the `$content` parameter; once again here) -- harmless in
  practice, since every child here (and everything nested inside it) is
  read-only and its own queries are transient-cached.

### Self-healing structure, not a locked `template` alone

An earlier version of this used `template` + `templateLock: 'all'` to
guarantee Header/Body/Footer always exist, in order, at this level. That
introduced a real, serious bug the moment a *fourth* required block
(`gateway/datatable-body`, added after Header/Footer already existed in
already-published content) needed to join the skeleton: `templateLock:
'all'`'s own built-in synchronization (`synchronizeBlocksWithTemplate`, in
`@wordpress/blocks`) matches existing blocks against the template **by
position, not by name**. A datatable block saved *before* Body existed had
only 2 children where the template now expected 3+; comparing
index-for-index, the sync found the *existing Footer* sitting at the
position the template now expected Body to be, and **discarded that
Footer outright**, replacing it with a fresh, empty one -- silently
throwing away a site owner's own Pagination/Results configuration the
moment the post was next opened and saved. (The same class of bug would
have hit the Facets block being added here in exactly the same way.)

`useRequiredInnerBlocks()` (`hooks/use-required-inner-blocks.js`) replaces
that positional repair with a name-based one that can't make the same
mistake: on every render, it checks which of the required names are
genuinely *absent* (never "in the wrong place"), and inserts only the
first missing one, at a position computed from *which other required
blocks already exist* -- never removing or replacing anything. Since
`insertBlock()` changes the block list, the hook naturally re-runs and
repeats until every required block is present, at which point it's a
no-op on every subsequent render. Given a partially-populated block --
missing only the newest required addition -- this converges on exactly
that one insertion, with everything else (including whatever a site owner
configured inside Header/Footer) left completely untouched.

**A brand-new, genuinely empty block is deliberately left to `template`
instead of this hook**, and that split is itself the fix for a second bug
reported after the above: with the hook also handling the empty case (as
an earlier version of this fix did, having dropped `template` entirely
under the belief the hook alone was now sufficient), a freshly inserted
datatable block came up completely empty, and dropping any *one* child
block into it would suddenly cause every other required section to
appear too. The cause was two independent mount-time effects racing over
the same "list is empty" moment: `useRequiredInnerBlocks()` (declared, so
its effect fires, before `useInnerBlocksProps` is even called) would
dispatch an `insertBlock()` for the first missing name while the list was
still empty; `template`'s own sync effect, having rendered from that same
still-empty snapshot, had no way to see that dispatch and proceeded on
its own belief that nothing existed yet, calling `replaceInnerBlocks()`
with the entire template and discarding what the hook had just inserted.
Two writers, one "is it empty" moment, each blind to the other. The fix
is `useRequiredInnerBlocks()` doing nothing at all while `innerBlocks` is
still empty (see the guard at the top of its effect) -- leaving that
moment to `template` exclusively -- and only ever stepping in once
something, anything, already exists to prove that moment has passed. That
also explains the reported symptom exactly: manually adding one block
made the list non-empty, which is precisely the condition under which the
hook starts converging on the rest.

**If you have existing content saved between the original position-based
bug being introduced and its fix:** reopening and re-saving is what
triggers the repair (this all runs in the editor, not on the front end)
-- but if a datatable block was already re-saved *while* the broken
`templateLock: 'all'` version was live, its Footer's Pagination/Results
configuration may already have been silently reset to defaults, and that
specific loss isn't something this fix can recover on its own (check post
revisions if that content mattered).

### Header/body/footer/facets: four named blocks, not smarter type-inference

An earlier version of this had `gateway/facet` and `gateway/pagination` as
*direct* children of `gateway/datatable`, sharing one InnerBlocks list, with
`render.php` grouping them by `$inner_block->name` into "above the table" /
"below the table" buckets, while the `<table>` itself stayed hardcoded in
`gateway/datatable`'s own `render.php` and its editor preview came from a
single `<ServerSideRender block="gateway/datatable">` positioned *below*
the whole InnerBlocks list. That worked on the front end (`render.php`
always put facets first, the table in the middle, pagination last,
regardless of edit-time order) but looked wrong while editing: the
InnerBlocks list -- header-like and footer-like children together -- and
the table preview were two separate regions, so a Footer's block card
always appeared to sit *above* the table in the editor, no matter that it
correctly rendered below it on the front end.

Making the table itself a named sibling block -- `gateway/datatable-body`
-- fixes that at the source, rather than working around it: now the
*editor's own InnerBlocks list* is Facets, Header, Body, Footer, in that
order, so Gutenberg's native rendering already puts them in the right
visual stacking while editing, matching the front end exactly, with no
separate "preview region" to fall out of sync. `gateway/datatable`'s own
`render.php` now only ever has to ask "which of these four named blocks is
this?" instead of inferring open-ended groups, and a site owner never has
to wonder where a facet vs. a pagination control will end up: the block
they're looking at is *named* for where its contents render. This is also
why `gateway/pagination`'s `edit.js` doesn't carry a "this always renders
below the table regardless of where it sits" notice -- there's no longer
anywhere else for it to sit; it can only ever be inside a Footer block.

`gateway/facet` moved again in this same round -- out of the Header (its
original home) and into a new, dedicated `gateway/datatable-facets` block,
rendered above the Header rather than being what the Header *is*. The
Header's own role changed to match DataTables' own default top row instead
(`topStart: pageLength`, `topEnd: search` -- see "Page Size and Search"
below): a block literally named "Header" holding page-length/search
controls reads naturally, whereas one *also* holding an open-ended list of
filters didn't. Splitting them into two blocks -- Facets is unbounded and
grows with however many filters a site owner adds; Header is fixed at
exactly the two controls DataTables' own top row has -- keeps each one's
`allowedBlocks` doing real, meaningful restriction instead of a generic
list two unrelated concerns had to share.

`gateway/datatable-facets`, `gateway/datatable-header`, and
`gateway/datatable-footer` are otherwise as simple as an InnerBlocks
wrapper gets: no attributes, no context of their own (`gateway/facet`
nested inside Facets still receives the parent's context exactly as
before -- Gutenberg's context propagation is transitive through any number
of intermediate blocks that don't override it, so an extra layer of
nesting doesn't break it). None of the three needs `gateway/datatable`'s
own inner-block-*splitting* treatment (there's no second zone to
interleave around) -- but each one's `render.php` still filters its
children by name explicitly before rendering anything, the same defensive
pattern `gateway/datatable`'s own render.php uses for its four zones,
rather than trusting `$content` (WordPress's own unconditional
concatenation of every child's rendered markup) wholesale. This isn't
redundant with `allowedBlocks`/`parent`: those only ever stop the
*inserter* from offering a disallowed child -- neither strips a block
that ended up here some other way (content saved under an earlier,
looser version of one of these restrictions -- this plugin has had a few
across this project's history -- or a block moved in directly via List
View, which isn't gated the same way the main inserter is). Reported as
"page sizer appears in header and footer": a `gateway/datatable-page-size`
block had ended up saved as a child of `gateway/datatable-footer` (Footer
only ever *allows* Pagination and Results, but nothing had stripped an
already-misplaced one out again), and `echo $content;` rendered it right
there alongside them, with no check that it belonged. Explicit per-block
`render.php` filtering closes that regardless of how a misplaced child
got there in the first place: Header can only ever show Page Size and
Search, Footer only Pagination and Results, Facets only `gateway/facet`,
no matter what their actual saved inner blocks contain. (A block filtered
out this way still visibly exists in the editor's own InnerBlocks list
and List View, exactly where it was left -- this only stops it rendering
on the front end; removing a genuinely misplaced block from a specific
post is still a manual edit.) `gateway/datatable-body` is the one with
real work to do -- see below.

### `gateway/datatable-body`: the table, as a sibling block

Moving the actual `<table>` (the WP_Query, column/facet resolution, and
headings/rows markup that used to live directly in `gateway/datatable`'s
own `render.php`) into its own block raised one real problem:
`gateway/datatable-body` needs `postType`/`limit`/`pageSize`/`columns`/
`facets` to run its query, and those live on the *parent*'s attributes,
reaching descendants only via context (`gateway/datatable`'s
`providesContext` now also exposes `limit`/`pageSize`, alongside the
`postType`/`columns`/`facets` it already did). On every *real* render --
front end, or this block rendered as part of loading a full page --
`$block->context` in `render.php` has all five, exactly as reliably as
`gateway/facet` and `gateway/pagination` already get their own context
values. The gap is narrower and more specific than that, and worth calling
out precisely:

- **`<ServerSideRender>` doesn't send context.** It only ever POSTs a
  block's own top-level *attributes* to the block-renderer REST endpoint
  (confirmed against `@wordpress/server-side-render`'s own source --
  `block`, `attributes`, `urlQueryArgs`, `className` are the whole prop
  list, nothing context-shaped). The endpoint reconstructs a standalone
  `WP_Block` with no real parent, so `$block->context` is empty in that one
  specific request -- not on the front end, not anywhere else `gateway/
  datatable-body` might render, just inside its own editor preview call.
- **The fix: compute `<ServerSideRender>`'s `attributes` prop directly
  from live context, on every render, in `edit.js`.** `previewAttributes`
  (a small `{ postType, limit, pageSize, columns, facets }` object,
  `useMemo`'d against the same context values) is passed straight to
  `<ServerSideRender block="gateway/datatable-body" attributes={
  previewAttributes } />` -- computed synchronously from whatever context
  currently *is*, never read back from this block's own (possibly-stale)
  persisted attributes.
  - **An earlier version of this instead mirrored context into this
    block's own attributes via `setAttributes()`, gated the preview
    behind an `isSynced` check, and showed a `<Spinner />` until that
    async mirror caught up.** That mirror wasn't reliably taking effect,
    leaving this block's own persisted `columns` stuck at a stale copy --
    a real bug, part of why "every column is sortable even when Sortable
    is turned off" was reported, but (see below) not the whole story.
    Computing the preview's attributes directly from context, every
    render, removes that entire mirror-then-render dependency for what's
    actually *shown*. No `<Spinner />` is needed either, since there's no
    async gap left to cover.
  - **The `setAttributes()` mirror is still kept, best-effort, wrapped in
    `__unstableMarkNextChangeAsNotPersistent( { history: 'ignore' } )`**
    (a `core/block-editor` store action -- without it, this effect firing
    on every page load would mark the post dirty and pollute undo history
    purely from opening it, for a change that represents no user edit;
    the real, undoable source of truth is the parent's own attributes,
    which this never touches). It gives this block's own *persisted*
    attributes a reasonable fallback for the rare case something renders
    it via `<ServerSideRender>` without this component's own live context
    available (e.g. WordPress's own post-preview/revision-diff routes) --
    but nothing about the editor's own visible preview depends any more
    on this mirror actually succeeding.
- **The actual, complete root cause: `<ServerSideRender>` sends
  `attributes` as a GET query string, and query strings have no boolean
  type.** Fixing the mirror above didn't fully resolve the report --
  confirmed by adding a temporary `console.log()` of the raw context
  value, which showed `{ key: "ID", sortable: false }` exactly right,
  proving the bug was downstream of everything already covered here. With
  no explicit `httpMethod="POST"`, `@wordpress/server-side-render`
  defaults to GET, serializing `attributes` via `addQueryArgs()` --
  confirmed against its own source. A query string has no way to
  represent a boolean: `sortable: false` arrives at PHP as the *string*
  `"false"`, and PHP's `empty( "false" )` is `false` (a non-empty
  string) -- so `render.php`'s original `! empty( $column['sortable'] )`
  evaluated to `true` for exactly the columns that were supposed to be
  excluded, but *only* on this one query-string-carried path. The front
  end, which decodes a real JSON boolean directly out of `parse_blocks()`,
  was never affected -- which is exactly why this looked like a
  editor-only bug even after the mirroring fix above landed, and why two
  separate, real bugs were layered on top of each other here. Fixed in
  `render.php` with `rest_sanitize_boolean()` (WordPress core,
  `wp-includes/rest-api.php`) in place of `! empty()`: unlike `empty()`,
  it specifically treats the strings `"false"` and `"0"` as `false`
  before falling back to a normal boolean cast, so it produces the
  correct result whether `sortable` arrived as a real boolean (front end)
  or its query-string-stringified form (editor preview) -- verified with
  both inputs directly, not just read through.
- **No `usesContext` needed for `data-has-pagination-block`-style
  suppression concerns.** Body doesn't need to know whether a Pagination
  or Results block exists elsewhere in the tree at all any more -- see
  "Suppressing DataTables' own default widgets" under Pagination/Results
  below for why that moved to being fully independent of this.
- **No `viewScript`.** The actual DataTables initialization
  (`shared/datatable.js`) stays entirely in `gateway/datatable`'s own
  `view.js`, unchanged -- it finds tables via `document.querySelectorAll(
  'table.gateway-datatable')`, a global query with no per-block scoping,
  so it doesn't matter which block's PHP actually emitted the `<table>`
  it's initializing.

### Configuring a facet block

In the Inspector: pick which of the parent's configured facets this
control represents (`controls/facet-key-control.js`, populated from the
`gateway/datatable/facets` context), then a UI Type
(`controls/ui-type-control.js`: Input, Select, or Checkboxes), and -- for
Input only -- a **Compare** (`controls/compare-control.js`): Contains or
Equals. This is deliberately separate from, and unrelated to, the *preset*
`compare` set on the Data Table block's Facets panel (`=`, `!=`, `>`, ...):
that one is baked into the initial server-side query; this one governs how
the *live*, client-side filter matches as a visitor types. It's also
deliberately just two options -- DataTables' `column().search()` has no
native numeric/date comparison operators, only substring/regex matching, so
Contains/Equals is what that mechanism can actually back up. Not shown for
Select/Checkboxes, since exact match is the only behavior that makes sense
against a fixed list of discrete values there.

A facet block only has something to hook into once its chosen field is
*also* one of the datatable's currently displayed columns (its DataTables
column index is how the front end targets it -- see below); `edit.js`
checks this against the `gateway/datatable/columns` context and shows a
`<Notice>` warning, rather than silently rendering nothing, when it isn't
(or when the referenced facet has since been removed from the parent
altogether).

### Server-side rendering (`blocks/facet/render.php`)

Re-validates everything from context rather than trusting `$attributes`:
the facet must still exist in the parent's facet list, and its key must
still be a displayed column, or the block renders nothing at all (the
editor's warnings above are what a site owner sees instead). For **Select**
and **Checkboxes**, options come from `Facet_Query::get_facet_options()`
-- real, currently-in-use values for core/meta fields, or a taxonomy's
actual terms (capped at 50 by default, cached like column discovery), not
a placeholder list. Each option is a `{ value, label }` pair -- for
core/meta they're the same string, but for a taxonomy `value` is the term
**slug** (what gets matched) and `label` the term **name** (what's shown),
the first case where those genuinely differ.

**Showing an already-applied preset:** the parent's Facets panel preset
`value` for this key (if any) is always applied to the initial `WP_Query`
regardless of whether a `gateway/facet` block exists for it -- so without
this, a visitor could see a table that's already narrowed with no
indication why, and a blank-looking control that implies "nothing is
filtered." `render.php` pre-fills the control from that preset value: the
Input gets it as its initial `value`; Select/Checkboxes pre-select the
matching option. When the preset value isn't among the (capped-at-50, or
otherwise discovered) options -- e.g. a taxonomy term outside that cap --
it's resolved and injected as an extra, selected option instead of silently
going unrepresented (`get_term_by( 'slug', ... )` for taxonomy; core/meta
values are their own label already). The block editor's own static preview
(`src/edit.js`'s `FacetPreviewContent`, which doesn't run through render.php) mirrors
this too, plus a one-line note naming the preset value, so a site owner sees
the same thing while editing that a visitor would see live.

### Front-end hookup (`blocks/facet/src/view.js`)

1. Finds the sibling `<table class="gateway-datatable">` (nearest
   `.gateway-datatable-block` ancestor) and **waits for** -- rather than
   initializes -- a DataTable instance on it, polling `$.fn.DataTable
   .isDataTable( table )` every 50ms for up to 5s. This file must never
   import `datatables.net-dt` (or `shared/datatable.js`, which does)
   itself -- see the "one bundle" note below; it's the reason this waits
   instead of calling `initGatewayDataTable()` directly the way an
   idempotent-init approach first tried here did.
2. Locates the target column via `shared/dom.js`'s `getColumnIndexByKey()`,
   matching this facet's `data-facet-key` against each `<th>`'s
   `data-column-key` (written by the datatable's `render.php`).
3. Wires interaction to `column.search(...).draw()`, reading the block's
   own `data-compare` for the Input control:
   - **Input, Contains** (default): plain substring search (`regex: false`),
     debounced 300ms.
   - **Input, Equals**, and **Select**/**Checkboxes** (always exact,
     regardless of `data-compare` -- that attribute only governs Input): an
     anchored regex built by `exactMatchPattern()` for an exact match rather
     than DataTables' default substring behavior -- picking one option
     shouldn't also match every other value that happens to contain it as a
     substring. Values are regex-escaped first.

   `exactMatchPattern()` matches a value as a full, standalone item in a
   **comma-separated list**, not just the whole cell (`(^|, )value(, |$)`,
   not `^value$`) -- because a taxonomy column's cell can hold multiple
   comma-joined term names for one post (`Column_Registry::get_cell_value()`),
   so "Equals" needs to mean "this term is one of them", not "this cell has
   exactly and only this one term". Checked boxes are OR'd together the same
   way. This still matches correctly for an ordinary single-value column
   (core/meta) -- with nothing else in the list, the pattern collapses to
   the same effect `^value$` would have had.

   All of this matching -- Contains and Equals alike -- runs against each
   cell's `data-filter` attribute, not its rendered text (see
   `get_cell_filter_value()` above); `view.js` itself needs no awareness of
   that, since `data-filter` is a plain DataTables convention the library
   honors automatically once the attribute is present in the markup.

**Only one bundle may ever import `datatables.net-dt`.** An earlier version
of this had the facet block's `view.js` call the same idempotent
`initGatewayDataTable()` the datatable block uses (reasoning: "whichever
script runs first initializes it, the other just reuses it, so order
doesn't matter"). That broke on the front end: `datatable/build/view.js`
and `facet/build/view.js` are two independently webpack-bundled entries,
so each `import 'datatables.net-dt'` was its own separate copy of the
library, and *executing* that import is what attaches `$.fn.DataTable` to
the shared jQuery global -- running it a second time, from the second
bundle, reset that global's internal "is this table already a DataTable?"
registry. Whichever script happened to run second then failed the
idempotency check it was relying on and initialized the table again --
visibly, a duplicated "entries per page"/search/pagination UI. The fix:
`shared/datatable.js` (which imports the library) is only ever imported by
`gateway/datatable`'s own `view.js` (front end) and `gateway/datatable-body`'s
own `edit.js` (editor -- never both at once, since one is front-end-only
and the other editor-only); the facet block's `view.js` imports only
`shared/dom.js` (`getColumnIndexByKey()` -- pure DOM, no jQuery/DataTables
dependency at all) and `shared/wait-for-datatable.js` (plain jQuery only),
and only ever *waits for and reuses* an instance, never creates one.
`gateway/pagination`'s and `gateway/datatable-results`'s `view.js`s follow
the exact same rule, for the exact same reason -- see the Pagination and
Results section below.

## Pagination and Results: dedicated footer controls

Two more leaf child block types, both restricted to `"parent":
["gateway/datatable-footer"]` (see "Header/body/footer/facets" above),
both found automatically by every mechanism documented above
(`Block_Loader`, `webpack.config.js`, no PHP or build changes needed). A
new datatable block gets one of each by default, via
`useRequiredInnerBlocks()`'s Footer default (see "Self-healing structure"
above); a site owner can remove or add more of either.

- **`gateway/pagination`** -- Previous/Next and page-number buttons,
  driving `page()`.
- **`gateway/datatable-results`** -- the "Showing X to Y of Z entries"
  summary, driving off `page.info()`.

`gateway/datatable-footer`'s own `style.scss` lays the two out with
`justify-content: space-between` (Results and Pagination pushed to
opposite ends of the row, mirroring DataTables' own default layout --
`bottomStart: info`, `bottomEnd: paging` -- the same relative positions
these two blocks replace) and `align-items: center` (aligned to each
other on that row, rather than to whichever one happens to be taller) --
the same treatment `gateway/datatable-header` already gives Page Size and
Search (see "Page Size and Search" below). Deliberately `flex-wrap:
nowrap`, not `wrap`: the editor canvas is narrower than most themes'
actual front-end content width (no sidebar/settings panel competing for
space there), so `wrap` -- fine on the front end, where both fit on one
line -- dropped Results onto its own line below Pagination's own
comparatively wide, several-button preview in the editor specifically,
even though neither block nor its CSS actually differed between the two;
only the available width did.

**`renderAppender` was also part of that layout breaking, separately from
`flex-wrap`.** `gateway/datatable-footer`'s (and `-header`'s) `edit.js`
used to pass `renderAppender: InnerBlocks.ButtonBlockAppender` to
`useInnerBlocksProps()` -- but that appender renders as its own extra flex
child (a floating "+" button) alongside the two real ones, inside this
same wrapper `<div>`. `justify-content: space-between` only reads as
"these two opposite ends" when there are exactly two flex children; with
a third one present, the *middle* child (Results, in DOM order) lands in
the middle of the row instead of at its own end, regardless of `flex
-wrap`. Both `edit.js`s now leave `renderAppender` unset, falling back to
Gutenberg's own default block appender -- rendered as part of the block
list chrome around the *last* actual child rather than as an extra flex
child of the wrapper `<div>` itself, so it no longer competes for a
position in this layout. `gateway/datatable-facets` (an open-ended list,
not a fixed two-item `space-between` row) still uses
`InnerBlocks.ButtonBlockAppender` deliberately -- there, an appender as
just another item in a wrapping flex list is exactly the right behavior.

**Neither of those was the actual root cause, though -- both were real
bugs, just not *this* one.** The layout still broke in the editor after
both fixes; inspecting the editor's actual rendered HTML (not just
reasoning about the CSS in isolation) showed why: the block's wrapper
`<div>` carried `wp-block-gateway-datatable-footer` (WordPress's own
generated class) but never `gateway-datatable-footer` -- the one class
`style.scss`'s `display: flex` and everything else actually target.
`edit.js` called bare `useBlockProps()`, while `save.js` calls
`useBlockProps.save( { className: 'gateway-datatable-footer' } )` --
those two are supposed to describe the *same* wrapper, one for each
context, and only `save.js` was passing the className. The front end
(built from `save.js`'s markup) always had the class and always laid
out correctly; the editor (built from `edit.js`'s) never had it, so no
flex rule -- `nowrap` or otherwise -- ever applied there at all, and
children just stacked as ordinary block-level flow. That's what "the
second item falls under the first" actually was, independent of
`flex-wrap` or the appender. Fixed by passing the same `className` to
`useBlockProps()` in `edit.js` as `save.js` already passes to
`useBlockProps.save()` -- done here, in `gateway/datatable-header`'s
`edit.js`, and in `gateway/datatable-facets`' for the same reason (it
has the identical `edit.js`/`save.js` className mismatch, just without a
`space-between` layout to visibly break over it).

**Why blocks, not just leaving DataTables' own built-in widgets in place:**
so their position on the page is something a site owner controls the same
way as everything else in the InnerBlocks area, and so their markup can be
restyled like any other block, rather than being stuck with whatever
`<div>` structure DataTables generates internally.

**No settings, no context.** Unlike `gateway/facet`, neither block targets
a specific column or needs to know the parent's `postType`/`columns`/
`facets` -- each drives one whole-table DataTables feature, so neither
declares `usesContext` or has attributes. Neither has any
`InspectorControls`; both `edit.js`s are *live* previews now, not static
ones -- see "A live editor preview, not a static one" below.

**Server-side rendering:** each renders an empty skeleton and nothing
more -- `gateway/pagination`'s disabled Previous/Next buttons and an empty
page-number container; `gateway/datatable-results`'s an otherwise-bare,
empty `<div>`. There's nothing more meaningful to render *server-side* for
either: the actual counts depend on DataTables' own client-side paging/
filtering state, which can also shift as live `gateway/facet` filters are
applied, neither of which is knowable at server-render time (the same
reasoning `gateway/facet`'s Select/Checkboxes options rely on real data
while the *interactivity* is entirely client-side) -- the editor's own
preview starts from this identical empty skeleton too, populating it
client-side the same way the front end does (see below), rather than
inventing a second, server-side-knowable approximation.

**Where they actually render:** below the `<table>`, unconditionally --
each can only ever be nested inside a `gateway/datatable-footer` block,
and the Footer always renders below the table (see "Header/body/footer"
above). There's no positioning ambiguity left to resolve here the way
there briefly was when facet/pagination shared one flat InnerBlocks list.

**Front-end hookup:** both find the sibling table exactly like
`gateway/facet` does (`shared/wait-for-datatable.js`'s
`findDataTableElement()` + `waitForDataTable()`).

### A live editor preview, not a static one

Reported, across two rounds: first "pagination in editor always shows 3
pages even when the real number would be different -- isn't reading the
actual page size at all"; then, once that was fixed, "fix hardcoded
Showing 1 to 10 of 20 entries so it shows the accurate statement... we
also need accurate page sizer because when we add a smaller limit like
'1' this normally shows on the front-end because it was appended to the
options... all dynamic segments must operate the same in editor as they
do on the front-end." Correct both times: earlier versions of
`gateway/pagination`'s, `gateway/datatable-results`' and `gateway/
datatable-page-size`'s `edit.js` each hardcoded a fixed, fake preview --
three page-number buttons, a fixed "Showing 1 to 10 of 20 entries"
string, and a generic `[10, 25, 50, 100]` option list -- entirely
unrelated to any real table, the same "static, non-functional preview"
`gateway/datatable-search`'s still deliberately is (there's no *state* to
preview for a search box beyond an initial empty value). All three don't
have to be static, though: `gateway/datatable-body`'s own editor preview
already initializes a real, live DataTable instance against its
`<ServerSideRender>` output (see "Initializing DataTables inside the
Gutenberg editor" above) -- each of these three, a *sibling* block, can
attach to that exact same instance instead of faking anything, the same
way its own `view.js` already does on the front end.

The shared mechanism, added for `gateway/pagination` first and then
reused as-is for the other two:

- **`shared/use-live-datatable-sync.js`** (new): an editor-only hook that
  polls (every 200ms, indefinitely -- not `waitForDataTable()`'s one-shot,
  5-second-timeout wait) for a live DataTable instance among the block's
  siblings, calling `attach( table, dataTable )` whenever one appears,
  calling the previous attachment's own cleanup first if it's being
  *replaced* (e.g. `use-datatable-init.js` destroys and recreates the
  instance after a Post Type change), and detaching entirely if the table
  disappears. Polling rather than a `MutationObserver` here specifically:
  unlike `use-datatable-init.js` (which watches one specific, local
  container it already owns), this hook has no closer shared container
  with the table than the whole `gateway-datatable-block` wrapper, several
  levels away in some layouts -- an observer broad enough to see it would
  fire far more often than this needs to check.
- **A prerequisite this surfaced:** `findDataTableElement()`
  (`shared/wait-for-datatable.js`) locates the sibling table via
  `.closest( '.gateway-datatable-block' )` -- but `gateway/datatable`'s own
  `edit.js` called bare `useBlockProps()`, the same missing-`className`
  gap "Header/body/footer/facets" above found and fixed for Header/
  Footer/Facets, just never noticed here before because nothing in the
  editor had ever tried to find the table from a sibling block until now
  (every other block's own editor preview was static). Fixed the same
  way: `useBlockProps( { className: 'gateway-datatable-block' } )`,
  matching `render.php`'s own `get_block_wrapper_attributes()` call.

Per block, the same three-part pattern -- a shared `attach*()` function
(the button-building/text-building/option-populating logic that used to
live entirely inside `view.js`, now reused by both it and `edit.js`), and
`edit.js` rendering the identical empty skeleton `render.php` does (no
placeholder content) while wiring `useLiveDataTableSync()` to it:

- **`gateway/pagination`**: `src/attach-pagination.js`'s
  `attachPagination( el, table, dataTable )` wires Previous/Next/page
  -number clicks to `page()` and re-renders on every `draw`. Result:
  correct page counts and disabled states, and clicking through the
  preview actually pages it.
- **`gateway/datatable-results`**: `src/attach-results.js`'s
  `attachResults( el, table, dataTable )` sets the "Showing X to Y of Z
  entries" text and re-renders on every `draw`. Result: an accurate,
  live-updating summary instead of a fixed string.
- **`gateway/datatable-page-size`**: `src/attach-page-size.js`'s
  `attachPageSize( el, table, dataTable )` populates the `<select>` from
  `dataTable.init().lengthMenu` -- the real, already-merged-with-defaults
  choice list, so a smaller configured Page Size like `1` shows up here
  exactly like the front end, not just a generic `[10, 25, 50, 100]` --
  and wires it to `page.len()`. No `draw` listener needed here (unlike
  the other two): nothing external changes the page length, so a fresh
  populate on each attach is enough.

**A regression this introduced, caught immediately after ("pagination
layout is broken, the buttons appear stacked instead of in a row"):**
`gateway/pagination`'s rewritten `edit.js` passed `{ ref: navRef }` to
`useBlockProps()` but dropped the `className: 'gateway-pagination'` an
earlier version had -- the exact missing-`className` mistake "Header/
body/footer/facets" above already covers, made fresh in the same block
this session's live-preview work had just touched. `style.scss`'s
`display: flex` never applied without that class, so Previous/the page
-number span/Next stacked as ordinary block-level flow. Fixed by restoring
the className alongside the ref. `gateway/datatable-search`'s `edit.js`
had the same latent mismatch (a separate nested `<div>` carrying the
class instead of `useBlockProps()` itself) -- fixed identically here even
though nothing had reported it yet, now that the pattern's cost (a broken
layout, not just an inert toolbar control) was freshly obvious.

`gateway/pagination`'s `src/view.js`:

- Previous/Next buttons call `dataTable.page( 'previous' | 'next'
  ).draw( 'page' )` -- the `'page'` argument to `.draw()` is what makes this
  a "standing redraw" that preserves the current paging position, rather
  than the full redraw `.draw()` alone would perform (which resets to page
  1 -- the same distinction `gateway/facet`'s search-driven redraws don't
  need, since resetting to page 1 after a filter changes what matches is
  the behavior actually wanted there).
- Page-number buttons are rebuilt on every DataTables `draw` event (fired
  after every redraw, including page changes *and* facet-driven filtering,
  either of which can change the total page count) via
  `dataTable.page.info()` (`{ page, pages, ... }`, both explicitly
  zero-based/total-count per the DataTables docs) -- a windowed list
  (`getPageWindow()`) centered on the current page, always including the
  first/last page with an `…` ellipsis marker where the window doesn't
  reach them, the same general shape most pagination widgets use. Rebuilding
  the whole list each time (rather than diffing) keeps this simple; a
  handful of buttons per redraw is not a cost worth optimizing away.
- The page-number container uses one delegated click listener rather than
  one per button, since the buttons themselves are torn down and rebuilt on
  every redraw -- a listener bound to any specific button wouldn't survive
  that.

`gateway/datatable-results`'s `src/view.js` rebuilds its text on every
`draw` event too, from the same `page.info()` -- `recordsDisplay`,
`recordsTotal`, `start`, `end` -- as "Showing X to Y of Z entries",
deliberately mirroring DataTables' own default `info` language strings
(`sInfo`/`sInfoEmpty`/`sInfoFiltered`, confirmed against its source) rather
than inventing new wording, since this block is a drop-in replacement for
that default widget, not a different feature: `entry`/`entries`
pluralizes on whichever count it's attached to (`_TOTAL_` for the main
string), "Showing 0 to 0 of 0 entries" replaces it entirely when there are
no matching rows, and a `(filtered from N total entries)` suffix is
appended whenever a live facet has narrowed `recordsDisplay` below
`recordsTotal`.

## Page Size and Search: dedicated header controls

The same pattern, one row up: two more leaf child block types, both
restricted to `"parent": ["gateway/datatable-header"]` (see "Header/body/
footer/facets" above), both found automatically by every mechanism
documented above. A new datatable block gets one of each by default, via
`useRequiredInnerBlocks()`'s Header default; a site owner can remove or
add more of either.

- **`gateway/datatable-page-size`** -- a "Show N entries per page"
  `<select>`, driving `page.len()`.
- **`gateway/datatable-search`** -- the global search box, driving
  `search()`.

Same reasoning as Pagination/Results applies throughout: no settings, no
context (each drives one whole-table DataTables feature); server-side
rendering is an empty/disabled skeleton, since the real choices/state only
exist once DataTables has initialized; each finds the sibling table via
`shared/wait-for-datatable.js`; each renders below -- here, *inside* -- the
`gateway/datatable-header` block that's the only place either is allowed
to live, so there's no positioning ambiguity to resolve.

`gateway/datatable-page-size`'s `src/view.js` populates its `<select>`
from `dataTable.init().lengthMenu` -- the `init()` API method returns the
full options object DataTables was actually constructed with, already
merged with defaults, so this is the *one* source of truth for "what
choices should this show" rather than a second copy of
`shared/datatable.js`'s own `buildLengthMenu()` computation. Selecting an
option calls `dataTable.page.len( Number( value ) ).draw()`.

`gateway/datatable-search`'s `src/view.js` wires its `<input>` directly to
`dataTable.search( value ).draw()` on every `input` event, deliberately
with **no debounce**: DataTables' own default search box applies on every
keystroke with no artificial delay (`searchDelay` defaults to `null`, and
`shared/datatable.js` never sets it) -- since this is a drop-in
replacement for that control, not a different feature, it matches that
behavior exactly rather than the 300ms debounce `gateway/facet`'s Input
control uses for a very different reason (many independent per-column
filters, not one whole-table one).

**Suppressing DataTables' own default widgets.** Without suppressing them,
adding any of these four blocks would produce two of the corresponding
control (DataTables' own default one, plus the block's). This used to be
handled with a data attribute (`gateway/datatable`'s `render.php` would
inspect its inner blocks and write `data-has-pagination-block="true"` on
the `<table>`, and `shared/datatable.js` would read it at DataTables-init
time to pass `layout: { bottomEnd: null }`) -- but that stopped being
possible once the `<table>` moved into its own sibling block
(`gateway/datatable-body`): Body and these controls' blocks are
*siblings*, several levels apart in some paths, and context only flows
downward from parent to descendant, never sideways between siblings, so
Body's own `render.php` has no way to know whether a Header or Footer
somewhere in the tree contains any of these four.

**A leftover call to the old mechanism's now-deleted `hasPaginationBlock()`
helper stayed behind in `shared/datatable.js`'s own `initGatewayDataTable()`
after that switch**, and went unnoticed because nothing in this codebase
calls that function directly in a way a build would catch: it only ever
ran inside the DataTables options object literal, at actual init time in
the browser, throwing a `ReferenceError` that aborted the whole
`$( table ).DataTable( {...} )` call before it ran. The practical effect
was silent and total: the `<table>` never actually became a DataTable
instance at all, so every block that waits on one via `waitForDataTable()`
-- Page Size, Search, Pagination, Results -- polled for the full 5-second
timeout and gave up, each remaining in its own empty/disabled placeholder
state (an unpopulated, disabled Page Size `<select>`; a disabled Search
`<input>` nobody could type into) with no error visible anywhere except
the browser console. The fix was simply deleting that dead branch --
DOM-based suppression, described below, was *already* doing the actual
work; this leftover call was only ever discarding its return value into
an options key nothing still read.

The fix is DOM-based instead, and doesn't need any such cross-sibling
visibility at all: `shared/wait-for-datatable.js`'s
`hideNativeDataTableWidget( table, widgetClass )` finds `table`'s overall
`.dt-container` wrapper and removes any element of the given class inside
it -- `dt-length`/`dt-search`/`dt-info`/`dt-paging`, each widget's own
container class, confirmed against DataTables' source
(`DataTable.ext.classes.length/search/info/paging.container`), always
rendered as part of the same `.dt-container` structure that also wraps the
`<table>` itself. Each block's `view.js` calls this once it's confirmed
its *own* control is wired up and ready to be the replacement, so the
underlying features (the page-length/search/paging/info-tracking logic
itself) stay fully active the whole time (DataTables' options are never
changed at all now), only their default rendered widgets disappear, and
only once there's actually something to replace them.

### Why `blocks/shared/`, not `blocks/datatable/src/shared/`

`shared/datatable.js`, `shared/dom.js`, `shared/wait-for-datatable.js`, and
`shared/use-available-columns.js` live in `blocks/shared/` (a plain
directory, no `block.json` -- `webpack.config.js`'s `blocks/*/block.json`
glob skips it, so it's never mistaken for a block entry) rather than inside
any one block's own `src/`, since more than one block needs each of them:
`dom.js`'s column-index lookup and `wait-for-datatable.js`'s find-table/
wait-for-instance/hide-native-widget logic are used by `gateway/facet`,
`gateway/pagination`, *and* `gateway/datatable-results`; the
column-fetching hook is used by `gateway/facet`'s `edit.js` to resolve a
friendly label for its selected facet. `datatable.js` lives here too but,
per above, is import-restricted to `gateway/datatable`'s own `view.js` and
`gateway/datatable-body`'s own `edit.js` regardless of where it lives.
Blocks import what they need via a relative path (`../../shared/...`).

## Extending: future child blocks

`gateway/facet` (inside Facets), `gateway/datatable-page-size` and
`gateway/datatable-search` (inside the Header), `gateway/pagination` and
`gateway/datatable-results` (inside the Footer) are the first leaf child
blocks; the same InnerBlocks + context pattern is what a future leaf block
would use too.

- **PHP:** `Block_Loader` already handles any number of block directories
  under `/blocks` with no changes needed.
- **Build:** `webpack.config.js` already compiles every `blocks/*/src/{index,view}.js`
  it finds into that block's own `build/`.
- **DataTables logic:** `shared/datatable.js`'s `initGatewayDataTable()` /
  `destroyGatewayDataTable()`, `shared/dom.js`'s `getColumnIndexByKey()`,
  and `shared/wait-for-datatable.js`'s `findDataTableElement()` /
  `waitForDataTable()` / `hideNativeDataTableWidget()` are already generic
  over "a table element," not tied to any one block's markup -- a new
  child block that needs to hook into an existing DataTable instance
  should use `wait-for-datatable.js`, never import `shared/datatable.js`
  or `datatables.net-dt` itself (see "Only one bundle may ever import
  `datatables.net-dt`" above). One replacing a native DataTables widget
  (like page-size, search, pagination, and results all do) should use
  `hideNativeDataTableWidget()` rather than reach for options passed at
  init time -- see "Suppressing DataTables' own default widgets" above for
  why the latter can't work once the table and its replacement blocks are
  siblings rather than parent/child.
- **Controls:** `shared/controls/post-type-control.js`,
  `limit-control.js`, and `page-size-control.js` are already standalone
  components for reuse in a future query/settings block -- `gateway/data-cards`
  (below) is exactly that "future block": all three moved here from
  `gateway/datatable`'s own `controls/`, unchanged, once it needed them too.
- **A new leaf block that belongs in Facets, Header, or Footer:** add it as
  an allowed child of that existing block (update that block's own
  `edit.js` `allowedBlocks`, and the new block's own `"parent"`) -- no
  changes needed to `gateway/datatable`'s own `render.php` at all, since it
  only ever asks "which of Facets/Header/Body/Footer is this," not what's
  inside any of them.
- **A genuinely new *position*** (a fifth zone, distinct from the existing
  four): add a fifth wrapper block alongside `gateway/datatable-facets`/
  `-header`/`-body`/`-footer`, following the exact same pattern (a plain
  InnerBlocks wrapper, its own `render.php` that echoes `$content` after a
  `count( $block->inner_blocks ) === 0` guard, unless it also needs context
  the way Body does), add its name to both `REQUIRED_BLOCKS` in
  `gateway/datatable`'s own `edit.js` (so `useRequiredInnerBlocks()` seeds
  and repairs it too) and to the lookup array in that block's `render.php`,
  and echo it wherever it belongs. The mechanism already supports any
  number of named zones, not just these four.

## Data Cards: a repeated card template (`gateway/data-cards` block)

A second grid block, alongside `gateway/datatable`: same idea (post type,
Limit, Page Size, Search, Page Size control, Pagination, Results), but
instead of columns picked from `Column_Registry` and laid out as `<table>`
rows, the user designs **one card** -- any blocks at all, commonly
Featured Image + Title + Excerpt -- and it's repeated once per matched
post. Modeled directly on WordPress core's own Query Loop / Post Template
blocks (`core/query` + `core/post-template`), including their editing UX:
click any card in the editor canvas to make *that* post's copy the real,
editable one; every other card is an inert preview, not a separate
"pattern," so editing the template once changes every card everywhere.

### Why this couldn't just be `gateway/datatable` with a different layout

DataTables owns an entire `<table>` and paginates/searches/sorts it
entirely client-side, over one result set fetched once. A card template
is fundamentally different: it's arbitrary, user-authored InnerBlocks,
repeated per post -- not a scalar value per column -- so there's no
`<td>` for `Column_Registry::get_cell_value()` to return a string into.
DataTables was never going to render that, and there's no version of
"just configure it differently" that changes what a card template *is*.
So this block:

- Does its own real, **server-side pagination/search** (a new REST route,
  `gateway/v1/data-cards/<post_type>` -- `Data_Cards_REST_Controller`),
  rather than DataTables' client-side paging over one fetched-once result
  set.
- Renders the SAME `gateway/data-cards-search`/`-page-size`/`-pagination`/
  `-results` *roles* as the table family, as their own dedicated blocks
  (not the same block names -- see "Why separate blocks, not shared
  ones" below), wired to fetch instead of a DataTables API instance.
- Uses `BlockContextProvider` + `useBlockPreview` for the template editing
  UX (see "The card template block" below) -- something no block in this
  plugin needed before, because every earlier InnerBlocks area here was
  either a fixed set of named children (`gateway/datatable`'s own four
  zones) or a flat, independently-edited list (`gateway/facet` inside
  Facets) -- never "one authored subtree, cloned per row of data."

### The block family

Mirrors `gateway/datatable`'s own composition almost exactly -- a
top-level parent with three fixed, named, self-healing children (no
Facets zone; not asked for, and `Facet_Query`'s discrete exact-match
facets don't map cleanly onto arbitrary InnerBlocks fields -- can follow
`gateway/facet`'s own pattern later if a concrete need shows up):

```
gateway/data-cards               <- postType, limit, pageSize; providesContext
├─ gateway/data-cards-header
│  ├─ gateway/data-cards-page-size
│  └─ gateway/data-cards-search
├─ gateway/data-cards-body        <- the card template (see below)
└─ gateway/data-cards-footer
   ├─ gateway/data-cards-pagination
   └─ gateway/data-cards-results
```

`gateway/data-cards/render.php` and `gateway/data-cards/src/edit.js`
(required-children self-heal, `template` seeding, `PostTypeControl`/
`LimitControl`/`PageSizeControl` in the Inspector) are close enough to
`gateway/datatable`'s own that there was nothing to design here -- the one
real difference is explained in "One query, three siblings" below.

### The card template block (`gateway/data-cards-body`)

This is the one block in this plugin with a real Post-Template-style
editing UX, and the one place this feature's core mechanism lives.

**Editor (`edit.js`):** `getBlocks(clientId)` reads the template's own
live InnerBlocks; `getEntityRecords('postType', postType, { per_page:
pageSize })` (via `@wordpress/core-data`) fetches a page-1 preview list of
real posts, exactly like `core/post-template`'s own editor preview does.
One `useState` tracks which post is "active." For every queried post, a
`BlockContextProvider` supplies `{ postId, postType }` (the same
un-namespaced context keys core's own Post Title/Post Featured Image/Post
Excerpt/etc. blocks already read -- so those blocks, and any other core
block, work inside this template with zero Gateway-specific "field"
blocks needed at all); inside that provider, the active post gets the
real, editable template (`useInnerBlocksProps`, seeded with a Featured
Image + Title + Excerpt starter via `template` on first insert -- nothing
stops removing/replacing any of it), and every post (active one included)
also gets an always-mounted `__experimentalUseBlockPreview` clone,
`display: none`d exactly when it's the active one. Clicking a preview
makes its post active. This -- rendering a preview for every item and
hiding, never unmounting, the active one's -- is deliberately copied from
`core/post-template/edit.js`'s own documented reasoning: "a preview is
rendered for each block context, but the preview for the active block
context is hidden. This ensures that when it is displayed again, the
cached rendering of the block preview is used, instead of having to
re-render the preview from scratch."

**Front end / real render (`render.php`):** ported from WordPress core's
own `render_block_core_post_template()` (`packages/block-library/src/post-template/index.php`
in a `wordpress/gutenberg` checkout), confirmed against that source
directly rather than reverse-engineered from behavior:

1. `$block->parsed_block['innerBlocks']` -- the authored template -- read
   directly off the already-instantiated `WP_Block` (a public property,
   same as `gateway/datatable-body/render.php` already relies on).
2. For each matched post: `$query->the_post()` (real WordPress Loop state
   -- global `$post`, `get_the_ID()`, etc. -- not just the block-context
   injection below, since arbitrary content dropped into the template,
   e.g. a shortcode, might read post data the old-fashioned way instead
   of via context); an early-priority `render_block_context` filter
   injecting `postId`/`postType`; then the template is rendered via a
   *synthetic* wrapper block (`blockName` set to the never-registered
   `core/null`, so `WP_Block` resolves no block type for it and just
   concatenates its innerBlocks/innerContent raw -- no render callback,
   no block-supports wrapper of its own) -- `(new WP_Block($wrapper))->render(['dynamic' => false])`.
   Exactly core's own trick for the identical problem (avoiding infinite
   recursion into the wrapping block's own render callback).
3. `wp_reset_postdata()` after -- "it's safest to always restore" is core's
   own reasoning, quoted directly, and applies here unchanged.

All of this lives in the new `Data_Cards_Renderer` service class
(`includes/class-data-cards-renderer.php`), not scattered across
`render.php` files -- `render_items()` is the per-post loop above,
reused by both the initial page's SSR (see "One query, three siblings")
and every later page `Data_Cards_REST_Controller` serves.

### One query, three siblings

Three of this family's blocks need the SAME query result: the grid itself
(Body), and Pagination/Results -- both nested under Footer -- need the
real page count and result totals to render *real* initial state (see
"PHP renders real state up front" below), not an empty skeleton. Those
are independently-dispatched sibling blocks (`gateway/data-cards/render.php`
finds and calls `->render()` on each by name, the same pattern
`gateway/datatable/render.php` already uses for its own four zones), and
WordPress block context only ever flows from ancestor to descendant, never
sideways between siblings -- so none of them can see what another
computed. Re-running the same `WP_Query` redundantly in each of their own
`render.php` calls would work, but at the cost of the exact thing "PHP
renders real state up front" exists for.

Solved the same way WordPress' own Loop API solves the identical
"sibling template code needs to share state" problem (`global $post`,
`global $wp_query`): `gateway/data-cards/render.php` -- the one common
ancestor -- runs the query, renders every card, and computes pager
metadata ONCE, stores it via `Data_Cards_Renderer::set_current( $state )`
immediately before dispatching Header/Body/Footer, and calls
`Data_Cards_Renderer::clear_current()` immediately after, so it never
leaks into a second, unrelated Data Cards block on the same page. Body,
Pagination, and Results' own `render.php` files just call `get_current()`
and render what they're given; if it's `null` (rendered outside a
`gateway/data-cards` parent -- moved out via List View, previewed
standalone), they render nothing rather than guessing.

### PHP renders real state up front

Unlike `gateway/datatable-search`/`-page-size`/`gateway/pagination`/
`gateway/datatable-results` (empty/disabled skeletons, because
DataTables' page count/length menu/info string are genuinely unknowable
until the client-side library initializes), none of that applies here --
the query already ran before any of these render. So:

- `gateway/data-cards-page-size` renders real `<option>`s
  (`Data_Cards_Renderer::build_length_menu()`, a PHP port of
  `shared/length-menu.js`'s `buildLengthMenu()` -- itself split out of
  `shared/datatable.js` so this block's *editor* preview could reuse it
  too, without transitively importing `datatables.net-dt`), not empty.
- `gateway/data-cards-pagination` renders real Previous/Next/page-number
  buttons (`Data_Cards_Renderer::build_page_window()`, a PHP port of
  `shared/pagination-window.js`'s `getPageWindow()`).
- `gateway/data-cards-results` renders the real "Showing X to Y of Z
  entries" text directly (`Data_Cards_Renderer::build_info_text()`, a PHP
  port of `shared/results-text.js`'s `buildInfoText()`).
- `gateway/data-cards-search`'s input starts enabled, not disabled --
  there's no live library instance to wait for at all.

To be precise about what this buys: the grid, its pager buttons/dropdown,
and its result count all show *correct* content immediately, with no
flash of an empty shell before JavaScript runs -- there's no version of
this block that looks broken with JavaScript disabled. Actually paging,
searching, or changing page size still needs `view.js` (a `<button
type="button">` has no native behavior of its own) -- this is "no
incorrect initial state," not "works with JavaScript off."

### Server-driven pagination without trusting the client

`gateway/data-cards-search`/`-page-size`/`-pagination`'s own `view.js`
call `shared/cards.js`'s `fetchCardsPage()` (plain `fetch()`, not
`@wordpress/api-fetch` -- no `view.js` in this plugin imports any
`@wordpress/*` package, and `wp-api-fetch`'s root-url/nonce middleware is
only ever auto-localized in wp-admin contexts, not guaranteed on a plain
front-end page) against `Data_Cards_REST_Controller`'s route, and
`renderCardsPage()` swaps the response's `html` straight into the grid
(a single `<ul class="gateway-data-cards-grid">`, matching
`core/post-template`'s own `<ul %wrapper%>%items%</ul>` structure exactly
-- not a wrapping `<div>` around it -- so the grid-layout classes
`supports.layout` generates land on the element that actually needs to
become a CSS grid). A plain `CustomEvent('gatewaycards:update')`,
dispatched on the grid by whichever widget just fetched, is how
Pagination/Results re-render themselves off *anyone's* fetch -- the fetch
equivalent of DataTables' own `'draw'` event, since there's no DataTables
API instance here to `.on('draw', ...)`.

The one real security question this raises: a public endpoint (this one
has to be -- it's the front-end pagination mechanism for already
-published content anyone can already see, so gating it on a capability
the way `Columns_REST_Controller` gates its own editor-only route would
403 every logged-out visitor) that could be made to render arbitrary,
client-supplied block markup would let any visitor make the server
execute any registered block type's render callback with attacker-chosen
attributes. So the REST route never accepts a template directly: every
real page render sets a short-lived transient
(`set_transient('gwdc_tpl_' . $template_id, serialize_blocks($template), HOUR_IN_SECONDS)`,
`$template_id` a hash of the template's own content), and the client is
only ever handed that opaque ID (`data-template-id` on the grid). The
route can only ever re-render a template the *server itself* already
rendered once, for the same post type, within the last hour -- never
anything a client invents. If a tab sits open longer than that (or the
object cache backing transients drops it early), the route responds `410
Gone` and `shared/cards.js`'s `handleCardsFetchError()` reloads the page
-- the only real recovery once the reference is gone, and a rare one in
practice (an hour is refreshed by every ordinary page view).

Trade-off worth naming: since a real `WP_Query` runs (and the transient
is written) on every single full-page render of a `gateway/data-cards`
block, not just the first time, a very high-traffic page carrying one
could mean a steady stream of small transient writes alongside the query
itself. Standard object caching (Redis/Memcached, common on any real
production install) makes this cheap; a site relying on the DB-backed
transients API by default should be aware this is a real write per page
view, not a cache hit after the first one.

### Why separate blocks, not shared ones

`gateway/data-cards-search`/`-page-size`/`-pagination`/`-results` are new
blocks, not the *existing* `gateway/datatable-search`/`gateway/datatable-page-size`/
`gateway/pagination`/`gateway/datatable-results` retargeted to also
understand a fetch-based grid. Those existing blocks' whole shape --
`waitForDataTable()`, `dataTable.page()`/`.search()`/`.page.len()` calls,
`hideNativeDataTableWidget()` -- is DataTables-instance-specific from the
ground up; branching each one's `view.js` between "a DataTables instance"
and "a fetch-driven grid" would tangle two genuinely different data
-source models into one file for no benefit, and risk regressing the
well-established table family while doing it. What *did* get shared,
because it cost nothing and avoided real duplication -- pure functions
with no DataTables dependency to begin with:

- `getPageWindow()` -- `pagination/src/attach-pagination.js` →
  `shared/pagination-window.js`.
- `pluralizeEntries()`/`buildInfoText()` -- `datatable-results/src/attach-results.js`
  → `shared/results-text.js`.
- `buildLengthMenu()`/`DEFAULT_LENGTH_MENU` -- `shared/datatable.js` →
  `shared/length-menu.js` (this one had to move regardless of Data Cards:
  `shared/datatable.js` imports `datatables.net-dt` as a side effect, and
  nothing outside `gateway/datatable`'s own `view.js`/`edit.js` may ever
  import that file -- see "Only one bundle may ever import
  `datatables.net-dt`" above).
- `useRequiredInnerBlocks()` -- `gateway/datatable/src/hooks/` →
  `shared/hooks/` (generic over `(clientId, required, buildBlock)` from
  day one; its own docblock already said as much).
- `PostTypeControl`/`LimitControl`/`PageSizeControl` -- `gateway/datatable/src/controls/`
  → `shared/controls/` (same story -- see "Extending" above).

All five moves are behavior-unchanged relocations -- every existing
caller was updated to import from the new location, nothing about how
any of them work changed.

## Facets for Data Cards (`isFilterable`/`facetType` + `gateway/card-facet`)

`gateway/datatable`'s own facets flow bundles two things together: a
top-level **Facets panel** (pick which fields become facets, set each
one's **default value** via the "Default" button + modal), and a
**column-index-based front-end binding** (`gateway/facet` finds its
target column via `getColumnIndexByKey()` and drives `dataTable.column(idx)
.search()`) that only works because a facet's field is also required to
be a currently *displayed column*. Data Cards has no columns and no
`<table>` to bind to by index, so only the second half doesn't transfer
-- the first half (a top-level place to configure a facet and its
default) still does, and in fact has to: there's no sensible per-instance
"default value" home on a freely-placed filter block itself, since
several instances could exist for the same field, or none at all.

So this reuses the table's actual shape -- a top-level `facets` attribute
+ Facets panel + Default-value modal, `providesContext`'d down -- and
only drops the parts that were specifically about columns: the "must
also be a displayed column" gate, and the column-index front-end binding
(replaced with the same REST-refetch mechanism Data Cards already uses
for Search/Pagination/Page Size).

### `isFilterable` / `facetType` (`Column_Registry`)

Every column `Column_Registry::get_columns()` returns now also carries:
```php
[ ..., 'isFilterable' => bool, 'facetType' => string[] ]
// facetType is a subset of ['input', 'select', 'checkboxes']; [] when isFilterable is false.
```
Says whether a field is suitable for use as a facet at all, and with
which UI types -- a Select of every distinct `post_content` value is
nonsense, and a taxonomy has no free-text compare mode `Facet_Query`
implements. Used by both Facets panels' own field pickers, and by
`gateway/card-facet`'s own `UiTypeControl` usage to trim which UI types
make sense for the chosen field.

- **Thumbnail** (`get_thumbnail_column()`): never filterable -- already
  excluded from the Facets panel before this; now explicit.
- **Taxonomy** (`get_taxonomy_columns()`): always filterable,
  `['select', 'checkboxes']` only -- `apply_facets()`'s taxonomy branch
  is a `tax_query` IN/NOT-IN by term slug, no free-text mode.
- **Core** (`get_core_columns()`): a new `FILTERABLE_CORE_COLUMNS`
  allow-list (filterable via `gateway_datatable_filterable_core_columns`,
  mirroring `Facet_Query::ALLOWED_CORE_COLUMNS`'s own pattern) --
  `ID`/`post_title`/`post_content`/`post_excerpt`/`post_name`/`post_parent`
  get `['input']` (free text; a Select of every distinct title would be
  unusable); `post_status`/`post_author` get `['select', 'checkboxes']`
  (small, enumerable sets); `post_date`/`post_modified`/`menu_order`/
  `comment_count` aren't filterable at all -- meaningful filtering on
  those wants a real range/comparison UI neither `gateway/facet` nor
  `gateway/card-facet` implements (their live compare vocabulary is
  `contains`/`equals` only), so offering them would be a confusing dead
  end, not a real choice.

  One real, if narrow, behavior change for the *existing* table: a facet
  on one of those four newly-excluded core fields can no longer be newly
  added or re-added from the picker (an already-saved one keeps working,
  since reconciliation only checks "is this key still a displayed
  column," not `isFilterable`) -- a deliberate quality trim, not an
  oversight; see `FILTERABLE_CORE_COLUMNS`'s own docblock for the
  reasoning per field.
- **Meta** (`get_meta_columns()`): always filterable, all three UI types
  -- no *new* restriction here. WordPress core has no reliable per-key
  *type* info for the common case (an unregistered-but-detected meta key,
  most of what `get_used_meta_keys()` surfaces) to narrow against; a new
  `gateway_datatable_meta_facet_type` filter lets a site that knows more
  about a given key (e.g. its own `register_post_meta()` `'type'` arg)
  narrow it later.

**`Facet_Query::get_facet_options()` fix**, needed to make `post_author`
genuinely usable as a Select/Checkboxes facet: its core-column branch
used to show raw numeric user IDs as the visible option text (a plain
`SELECT DISTINCT post_author`, with no name resolution). Now resolves
each distinct ID to its display name via one batched `get_users()` call,
keeping the raw ID as the actual matched `value`.

### `Facet_Query::validate_facets()` -- one shared trust boundary, three callers

Previously, `datatable-body/render.php` validated its own `facets`
attribute inline (a key not in the post type's available columns is
dropped, never trusted). Extracted into `Facet_Query::validate_facets(
$raw_facets, $available_columns )`, with two additions: it also drops a
facet whose column has `isFilterable !== true`, and it accepts `value` as
a string *or an array of strings* (a Checkboxes facet with more than one
box checked -- see below). Three callers now share it:
`datatable-body/render.php` (refactored, behavior-unchanged), `gateway/data-cards/render.php`
(new -- validating the block's own configured `facets` attribute before
applying it to the initial query), and `Data_Cards_REST_Controller` (new
-- validating a visitor's live facet state on every fetch, the one case
this is a genuine trust boundary rather than defense in depth).

**Checkboxes send every checked value, OR'd together.** A real gap
otherwise: `apply_facets()` only ever accepted one scalar `value` per
facet, even though `gateway/facet`'s own client-side checkbox handling
already OR-matches multiple checked boxes -- shipping `gateway/card-facet`
checkboxes that silently used only the first would be a known,
avoidable bug. `tax_query`'s `terms` already accepts an array of slugs
natively; the meta branch gets `compare: 'IN'` when the value is an
array; the core-column `posts_where` branch gets a new
`IN (%s, %s, ...)` case, still fully `$wpdb->prepare()`'d.

### The top-level Facets panel, generalized for reuse

`FacetsPanel`, `FacetConfigTable` (the table + per-row "Default" button
+ modal), and `FACET_COMPARE_OPTIONS` moved from `gateway/datatable/src/controls/`
to `blocks/shared/controls/`, alongside `AvailableColumnsList` and the
tiny `classnames()` helper both of those already depended on (and, for
the editor styling to actually follow -- block.json's own CSS enqueuing
is per-block -- `.gateway-columns-available`/`.gateway-columns-config`/
`.gateway-facet-default-modal` moved to a new `shared/facets-controls.scss`,
`@use`'d from both `gateway/datatable`'s and `gateway/data-cards`'s own
`style.scss`).

The one real change: `FacetsPanel` used to compute its own selectable
-fields list internally, from two props (`availableColumns`,
`displayedColumns` -- `gateway/datatable`-specific, since Data Cards has
no "displayed columns" concept at all). It now takes an already-filtered
`selectableColumns` prop the caller computes:
- `gateway/datatable/src/edit.js`: displayed columns ∩ `isFilterable`.
- `gateway/data-cards/src/edit.js` (new): `isFilterable` alone.

`gateway/data-cards` gains a `facets` attribute (`[{key, compare,
value}]`, same shape as the table's own), `providesContext`'d as
`gateway/data-cards/facets`, and its own "Facets" Inspector panel using
the same relocated `FacetsPanel` -- including the exact same Default
-value modal. `useReconcileFieldList` (already generic, already used
twice by `gateway/datatable/edit.js` -- also relocated to `shared/hooks/`)
reconciles it against `isFilterable` fields the same way.

### `gateway/data-cards-facets` (new zone) + `gateway/card-facet` (new block)

A fourth required, self-healing zone -- `gateway/data-cards-facets`, a
direct copy of `gateway/datatable-facets`' own shape -- joins Header/Body/
Footer as `gateway/data-cards`' own children, rendered first (Facets,
Header, Body, Footer, matching the table family's fixed order exactly).
It's the *encouraged* home for `gateway/card-facet` blocks, not the only
one: per explicit request, `gateway/card-facet`'s own `block.json`
`parent` also lists `gateway/data-cards`, `gateway/data-cards-header`, and
`gateway/data-cards-footer` directly -- never `gateway/data-cards-body`
(the repeated template), where a filter would render once per visible
card with no well-defined way to reconcile conflicting values. Each of
those three other homes' own `allowedBlocks`/`$allowed_names` (editor
*and* render.php -- both need to agree, or the block silently never
renders even if the inserter offers it) was updated to match. A loose
`gateway/card-facet` dropped directly under `gateway/data-cards` itself
(a sibling of the four named zones, not nested in any of them) is
collected and rendered right after the Facets zone, regardless of where
among the other zones it actually sits in the editor's own list --
simpler and more predictable than preserving its exact interleaved
position.

`gateway/card-facet` itself is `gateway/facet/render.php` and `edit.js`
minus the "is it a displayed column" half of every check (no counterpart
exists for cards) -- `FacetKeyControl` (help text genericized),
`UiTypeControl` (gains an optional `allowedTypes` prop, trimmed here to
the selected field's own `facetType`), and `CompareControl` are all
reused as-is from their new `shared/controls/` home. Its own front end
(`view.js`) doesn't build a request payload itself: `shared/cards.js`'s
`fetchCardsPage()` already gathers every currently-active card-facet
under the same grid on *every* fetch (`collectActiveFacets()` --
searches `.gateway-card-facet` elements, reads each one's current
value(s) by its `data-ui-type`, resolves "contains"/"equals" to the real
`LIKE`/`=` `Facet_Query` operators), so a Pagination click or Page Size
change never silently drops an active filter, and `gateway/card-facet`'s
own `view.js` just needs to trigger a fetch (debounced 300ms for the
`input` UI type, matching `gateway/facet`'s own and
`gateway/data-cards-search`'s reasoning).

Because each card-facet's own DOM value already reflects its default
(pre-filled server-side by `render.php`, the exact same "Facets panel
preset" mechanism `gateway/facet` already uses) unless a visitor changed
it, `collectActiveFacets()` naturally captures the full effective filter
state -- defaults and live edits alike -- with no separate merge step.
And since `gateway/data-cards/render.php` now also resolves, validates,
and applies its own `facets` attribute to the *initial* query (the one
real change to that file for this feature), a configured default value
takes effect on first paint, exactly like the table.

## Laravel Models (Illuminate/Eloquent)

Gateway's blocks currently read data exclusively from WordPress Custom Post
Types via `WP_Query` (`Column_Registry`, `Facet_Query`, `Data_Cards_Renderer`,
etc.). This section is the first step toward an alternative: feeding blocks
from **Laravel models** backed by their own database tables, defined and
migrated the same way a Laravel application would, without requiring one.
Nothing yet *consumes* this -- no model classes, no migrations, and no block
wiring exist -- this step only vendors the runtime and loads it.

### What's vendored, and why

The package is Laravel's own **`illuminate/database` v11** (Eloquent ORM +
the Schema/migration Blueprint builder in one package) -- not, despite the
name that motivated this work, a Symfony database package. The mix-up is
understandable: `illuminate/database` does pull in several genuine Symfony
components as transitive dependencies (`symfony/translation`,
`symfony/clock`, `symfony/translation-contracts`,
`symfony/polyfill-mbstring`), alongside Carbon (date handling), Doctrine's
inflector, and a handful of small `illuminate/*` and `psr/*` support
packages. 20 packages in total resolve from that one top-level requirement;
the full list is in `composer.lock`.

Both halves of the request work standalone, outside a full Laravel
application, via Laravel's own "Capsule" pattern:

```php
use Illuminate\Database\Capsule\Manager as Capsule;
use Illuminate\Database\Schema\Blueprint;

$capsule = new Capsule();
$capsule->addConnection( [
	'driver'   => 'mysql', // or 'sqlite', etc.
	'host'     => DB_HOST,
	'database' => DB_NAME,
	'username' => DB_USER,
	'password' => DB_PASSWORD,
	'prefix'   => '',
] );
$capsule->setAsGlobal();
$capsule->bootEloquent();

// Migration-style schema definition:
$capsule->schema()->create( 'widgets', function ( Blueprint $table ) {
	$table->id();
	$table->string( 'name' );
	$table->timestamps();
} );

// A real Eloquent model:
class Widget extends \Illuminate\Database\Eloquent\Model {
	protected $table = 'widgets';
}
```

This was verified end to end with an in-memory SQLite smoke test exercising
schema creation, `Model::create()`/`get()`/`count()`, and Carbon-cast
timestamp attributes -- all before wiring anything into the plugin itself.

### Why it's committed to the repo instead of installed via Composer

Gateway is distributed as a WordPress plugin: whoever installs it activates
a folder, they don't run a build step. Requiring `composer install` on
activation isn't an option, so the fully-resolved `vendor/` directory is
committed to this repository exactly as `composer install` produced it --
`composer.json` and `composer.lock` exist for reproducibility and future
updates, not because an end user (or even a site administrator) ever runs
Composer themselves.

Producing that tree here required two manual cleanup passes that a normal
`composer install` gets for free, because this sandbox's proxy couldn't
reach GitHub's zipball downloads and Composer transparently fell back to
`git clone` from source for every package:

- Removed each package's embedded `.git` directory (history, not runtime
  code -- left in place it would bloat the repo and risk being mistaken for
  a submodule).
- Applied each package's own `.gitattributes` `export-ignore` rules by
  hand (normally applied automatically when GitHub generates a dist
  zipball, not when cloning from source) -- stripping `tests/`, `.github/`
  CI config, and lint/doc tooling that a production install would never
  ship. `vendor/` dropped from 86MB/4067 files to 14MB/1935 files as a
  result, with no runtime code touched.

See `vendor/README.md` for the same explanation from inside that directory,
plus update instructions for the next time a package version needs bumping.

### Namespaces are unprefixed -- a deliberate, accepted trade-off

These packages ship under their real `Illuminate\*`, `Symfony\*`, `Carbon\*`,
etc. namespaces -- not rewritten behind a Gateway-specific prefix (the way a
tool like php-scoper would). This is a known risk in the WordPress plugin
ecosystem: if another active plugin on the same site bundles a different,
incompatible version of any of these same packages (Carbon and Symfony
components are commonly bundled elsewhere), PHP will raise a fatal
"class ... already declared" error rather than either version silently
losing. That risk was weighed and knowingly accepted in favor of simplicity
and working directly with upstream Laravel documentation/examples without a
translation layer; it can be revisited later if a real collision surfaces.

### Loading

`gateway.php` requires `vendor/autoload.php` (guarded with `file_exists()`)
immediately after the plugin's own constants are defined, before any of
Gateway's own `includes/` classes are required -- so every vendored class is
available from `plugins_loaded` onward, the same lifecycle point Gateway's
own classes boot from. Gateway's own classes are unaffected: they still use
plain `require_once` (see Architecture above), not PSR-4 autoloading --
`vendor/autoload.php` covers only the new vendored packages.

Bundling `illuminate/database` v11 raised the plugin's own minimum PHP
version from 7.4 to 8.2 (Laravel 11's own requirement) -- reflected in both
this README's Requirements section and the `Requires PHP` line in
`gateway.php`'s own plugin header.

### Model_Registry and Migration_Registry

No model or migration classes exist yet, but plenty of future code will
need to answer "what models/migrations does this app actually have" --
a future admin screen listing them, block editor code offering "which
model" as a data source alongside post types, a "run pending migrations"
action. Rather than each of those scanning a directory of files (fragile,
and modeling classes don't have to live in any one predictable place) or
re-deriving the list its own way, `Model_Registry` and `Migration_Registry`
(`includes/class-model-registry.php`/`class-migration-registry.php`) are
the one place a class registers itself, and the one place anything else
asks for the full list back.

Registering a model is a single call, made right after the class itself
is defined:

```php
class Widget extends \Illuminate\Database\Eloquent\Model {
	protected $table = 'widgets';
}
\Gateway\Model_Registry::register( Widget::class );
```

`register()` accepts either form -- the class itself via PHP's `::class`
(the form above; nothing is instantiated), or an actual instance
(`Model_Registry::register( new Widget() )`, which just reads
`get_class()` back off it) -- registering a model never needs (or
triggers) a database connection either way. A class that doesn't
actually extend `Illuminate\Database\Eloquent\Model` is rejected (via
`_doing_it_wrong()`, not a fatal error -- one misregistered class
shouldn't be able to take every other already-registered one down with
it) rather than silently accepted, the same "never let something
unrecognized in" posture `Column_Registry` already takes for columns.
`Model_Registry::all()` returns every registered model's class name;
`has()`/`count()`/`unregister()` round out the API.

`Migration_Registry` is -- deliberately -- the exact same mechanism
pointed at a different base class (`Illuminate\Database\Migrations\Migration`
instead of `Eloquent\Model`):

```php
class CreateWidgetsTable extends \Illuminate\Database\Migrations\Migration {
	public function up() { /* ... */ }
	public function down() { /* ... */ }
}
\Gateway\Migration_Registry::register( CreateWidgetsTable::class );
```

Both are thin subclasses of one shared `Registry` (`includes/
class-registry.php`) -- a subclass only names its own bucket
(`registry_key()`) and the base class its members must extend
(`required_base()`); `Registry` itself implements `register()`/`all()`/
`has()`/`count()`/`unregister()` once. One PHP subtlety worth calling
out: `Registry`'s list of registered classes is a *single* static
property, bucketed internally by each subclass's own `registry_key()`,
rather than `protected static $items = array();` redeclared per
subclass -- PHP only gives a static property independent storage per
subclass when the subclass itself redeclares it; inherited as-is, both
subclasses would silently share one underlying list. Verified directly:
registering models and migrations side by side confirms each registry's
`count()` reflects only its own, and that a model registered under
`Model_Registry` is correctly rejected by `Migration_Registry::has()`.

`Model_Builder` and `Directory_Loader` (both below) are the two real
callers now, but a plain extensibility path stays in place for a model/
migration class defined some other way: `gateway_boot()` fires two
action hooks, `gateway_register_models` and `gateway_register_migrations`,
right after `Database_Connection::boot_capsule()` (so Eloquent is already
usable by anything hooked in here) and before `Directory_Loader` runs.

### Model_Builder: generating and running a model on the fly

The admin app's Models screen (below) turns a single "Title" field into a
working model -- a generated Eloquent model class, a generated migration
that creates its table, and the table itself, all before the request that
submitted the form returns. `Model_Builder::create( $title )`
(`includes/class-model-builder.php`) is where all of that actually
happens.

**Where generated files live.** `wp-content/gateway/models/` and
`wp-content/gateway/migrations/` -- deliberately *outside* the plugin's
own directory (`GATEWAY_MODELS_DIR`/`GATEWAY_MIGRATIONS_DIR`, defined
alongside `GATEWAY_PLUGIN_DIR` itself in `gateway.php`, but built from
`WP_CONTENT_DIR` instead). These are generated *user data* -- specific to
what a site owner has actually built -- not plugin code, so they belong
somewhere that survives a plugin update or reinstall, the same reasoning
behind `wp-content/uploads`. `gateway_activate()` creates both on plugin
activation (`wp_mkdir_p()`, idempotent if they already exist);
`Model_Builder` also creates them defensively at save time, so a save
never fails just because a directory got removed after activation.

**Deriving names from the title.** The vendored `illuminate/support`
package (a dependency of `illuminate/database` -- see "What's vendored,
and why" above) does the real work here, the same way Laravel's own
`make:model` would: stray punctuation is stripped first (so a title like
"Blog Post!!" doesn't survive straight into an invalid class name), then
`Str::studly()` gives the class name (`BlogPost`) and `Str::snake(
Str::pluralStudly( $class_name ) )` gives the table name (`blog_posts`)
-- including correctly-irregular plurals (`Category` -> `categories`,
via `doctrine/inflector` underneath `Str::plural()`), not a naive
"add an s". The model file explicitly sets `$table` to this computed
name rather than relying on Eloquent's own default-table-name inference
to independently arrive at the same string -- one computation, used by
both the model and the migration, instead of two that merely usually
agree.

**Generated files are unnamespaced**, and reference Illuminate classes by
fully-qualified name (`\Illuminate\Database\Eloquent\Model`) rather than
a `use` import. This avoids a real, if narrow, hazard: a title like
"Model" or "Migration" would otherwise produce `class Model extends
Model` in a file that also has `use Illuminate\Database\Eloquent\Model;`
-- a fatal "cannot declare class, name already in use" error, since the
import and the declaration would collide. Referencing the base class by
its full name sidesteps this for any title at all, with no reserved-word
list to maintain. This is also exactly the shape classic (pre-namespaced)
Laravel migration stubs used, for the same underlying reason: files
dropped into a shared location by name, not composed into an app's own
namespace tree.

**Migration versioning.** Every generated migration declares a public
`$version` (a single, plugin-wide, monotonically increasing integer --
`gateway_next_migration_version`, not one counter per table, so "version
4" unambiguously identifies one specific migration regardless of which
table it belongs to) and its filename is version-prefixed
(`000004_create_blog_posts_table.php`) purely so a plain directory
listing sorts in creation order -- the same purpose Laravel's own
timestamp-prefixed migration filenames serve, just a simpler counter
since nothing here needs to merge migration histories across branches.
`Migration_Runner` (`includes/class-migration-runner.php`) is what
actually makes the version number useful: `run( $migration_class )` calls
its `up()` and records the version as done (a `gateway_ran_migrations`
option, version number => class + timestamp) -- idempotent, since a
version already recorded is treated as an immediate success rather than
running `up()` a second time. `has_run( $version )`,
`latest_ran_version()`, and `latest_registered_version()` (the highest
version among everything `Migration_Registry` currently knows about,
whether run or not) are there specifically so a future "run pending
migrations" screen has what it needs already built -- not part of this
change, but this is what "so we can track if the latest migration has
been run" is for.

**Running the migration immediately** is the one deliberate departure
from a normal Laravel workflow, where `artisan migrate` is always a
separate, later step: here, a model with no backing table yet isn't
useful for anything, so `create()` calls `Migration_Runner::run()` as
part of the same request that generated the files. If that run fails
(the database is unreachable, a stray syntax issue in a hand-edited
template, etc.), both generated files are deleted and both classes
unregistered rather than left behind -- a half-created model (a class
that looks usable but has no real table) would be worse than the create
request simply failing outright.

**`Schema::create(...)`, without Laravel's facade system.** Real Laravel
migrations call the `Schema` facade, which resolves through Laravel's
service container to the current connection's schema builder -- nothing
this plugin sets up, since it runs Eloquent standalone via Capsule (see
"Wiring the connection up for Laravel models" above), with no container
for a real facade to resolve against. `includes/class-schema-facade.php`
defines a small stand-in: a bare, unnamespaced `Schema` class (so
unnamespaced generated migrations can call it unqualified, exactly like
real Laravel migrations do) whose `__callStatic()` proxies every call
straight to `Capsule::schema()`. `Schema::create()`, `Schema::table()`,
`Schema::dropIfExists()`, etc. all work in a generated migration exactly
as they would in a real Laravel one.

**Auto-loading what's on disk.** `Directory_Loader::load( $dir,
$registry_class )` (`includes/class-directory-loader.php`) is what makes
"every model/migration is always available" true regardless of how it
got onto disk (generated by `Model_Builder`, or hand-added) --
`gateway_boot()` calls it once for each directory/registry pair on every
request, before the `gateway_register_models`/`gateway_register_migrations`
hooks above. For each `.php` file in the directory, it snapshots
`get_declared_classes()`, `require_once`s the file, and registers
whichever class newly appeared -- diffing declared classes rather than
guessing a class name from the file name is what lets this one generic
method serve both models and migrations (and any hand-added file using
any naming convention at all), the same reasoning `Registry` itself
used to share one implementation between `Model_Registry` and
`Migration_Registry`.

### Plural Title -- a display label, not a naming input

`create()`/`rename()` take an optional second field, **Plural Title**
(e.g. "Blog Posts" for a "Blog Post" model) -- a plain stored label
(`gateway_model_plural_titles`, class name => text, in
`Model_Builder::get_plural_title()`/`set_plural_title()`/
`forget_plural_title()`) for a future screen to show, e.g. as a list
heading. It has **no effect on the class or table name** -- those come
from Title alone (`Str::pluralStudly()`'s auto-pluralization of it). An
earlier version let Plural Title override the table name instead, which
turned out to be more confusing than useful in practice: the table would
change out from under a model whose Title never changed, with no obvious
reason why from that model's own detail screen.

Because Plural Title carries no naming consequence, editing only it is
never destructive: `rename()` recognizes a Title-unchanged request and
just updates the stored label -- no file, migration, or table is
touched. Renaming to a new class-name-preserving Plural Title's
opposite -- the *old* class's stored label is forgotten and the *new*
one's is set from whatever was submitted -- happens automatically
whenever Title *does* change too, via the same call.

### Renaming a model

The admin app's model detail screen (below) can edit a model's Title
after the fact. Per the request that shaped this -- "deal with the
consequences: remove old model, remove old migration, make new ones" --
a rename in this system is not an in-place `ALTER TABLE RENAME`: it's
the old model retired (its table dropped, both its files deleted, both
its classes unregistered) and a new one generated in its place, exactly
like a fresh `create()`. **Any data in the old table is lost** -- an
accepted trade-off for these early, `id` + timestamps-only models with
no real schema yet; the React side makes sure this isn't a surprise (see
below).

`Model_Builder::rename( $old_class, $title, $plural_title )`: the new
model, migration, and table are created first -- exactly via `create()`
itself -- and only once that has actually succeeded is the old one
retired (its migration's own `down()` run via a new
`Migration_Runner::rollback()`, which also removes it from the
ran-migrations log, then both old files deleted and both old classes
unregistered). This ordering is deliberate: if creating the new model
fails partway through, the old one is simply untouched, rather than this
leaving *neither* a working old model nor a working new one. This full
path only runs when Title actually changes -- see "Plural Title" above
for the (much simpler, non-destructive) path when it doesn't.

Renaming to the exact same effective class (re-saving unchanged, or an
edit that sanitizes back to what was already there) is a no-op success
-- nothing is dropped or regenerated for a change that wouldn't actually
change anything. A failure specifically while dropping the *old* table
(the new model already exists and works by that point) is reported back
as a `warnings` entry rather than failing the rename outright -- worth
surfacing so a site owner can clean up an orphaned table by hand, but
not worth discarding an otherwise-successful rename over.

### Fields (`Model_Fields`) -- an ACF-style Field Editor, backed by real columns

A model's detail screen (below) also has a Field Editor: Add Field, a
list of existing fields, and the ability to edit or remove one -- the
same shape as ACF's own field editor, deliberately. Two currently
supported types, **Text** and **Number** -- each one's own `Field_Type`
class (see "Field_Type_Registry" below) says which Schema Blueprint
column method actually creates it (`string`/`double` respectively).

**Every field is a real column, not just metadata.** Adding one
generates and immediately runs an ADD COLUMN migration; editing one's
name and/or type runs a RENAME COLUMN and/or MODIFY COLUMN migration
(whichever the change actually needs -- unchanged fields never trigger
one at all); removing one runs a DROP COLUMN migration. All three follow
the same "generate, run, only then record the metadata" ordering as
`Model_Builder::create()` itself -- if the migration fails, nothing about
the field is recorded, so metadata and the real schema can never drift
apart. This needed no new vendored dependency: this version of
`illuminate/database` compiles native SQL for `renameColumn()`/`change()`
directly (verified empirically against a real SQLite connection --
add/rename/change-type/drop all worked with no `doctrine/dbal` involved),
unlike older Laravel versions that needed it for column modification.

**Storage: one flat array per model, deliberately not split into parallel
arrays.** `gateway_model_fields` (class name => array of `{name, type}`)
-- two fields simply sit as neighbors in the same array, never a
`{names: [...], types: [...]}` shape. A generated model's own
`getFields()` (baked into `model_template()` -- see below) just calls
`Model_Fields::all( static::class )` every time it's invoked, so editing
a field's *metadata* never needs to touch or regenerate the model's PHP
file the way a Title change does -- only the *migration* side of an edit
writes a new file (one per change, never the model file itself).

**`getFillable()`, overridden -- not a `$fillable` property.** Per the
request that shaped this: rather than declaring `protected $fillable =
[...]` (which would need rewriting every time a field changes),
generated models override Eloquent's own `getFillable()` method instead:

```php
public static function getFields() {
	return \Gateway\Model_Fields::all( static::class );
}

public function getFillable() {
	return array_column( static::getFields(), 'name' );
}
```

Both are written into the model file once, at `create()` time, and never
need to change again -- `getFillable()` always reflects whatever
`getFields()` currently returns, and `getFields()` always reflects
whatever's currently stored, live.

**Field names are real column names**, so they go through the same
sanitize-to-a-safe-identifier treatment a Title does (lowercase,
non-alphanumeric runs collapsed to `_`) -- "First Name" becomes column
`first_name`. Three names are reserved (`id`, `created_at`,
`updated_at` -- every model's own base columns already) and rejected
outright; a name colliding with another field already on the same model
is rejected too.

**Every field migration's class name is version-suffixed**
(`AddFirstNameToTicketsTableV7`, not just `AddFirstNameToTicketsTable`)
-- unlike a model's one-time "create table" migration, the *same* field
can legitimately be added, edited, and removed more than once over a
model's life, so the class name alone can't be assumed unique; appending
the (globally monotonic) version number guarantees it always is.

**A field is never carried over on model rename.** Renaming a model
already drops its old table (see "Renaming a model" above); the old
field *definitions* aren't replayed onto the new one either, for the
same reason Plural Title's cousin (the table itself) isn't preserved --
a rename starting completely fresh, rather than a rename silently
generating a whole cascade of new field migrations on the new table on
your behalf.

`Model_Field_REST_Controller`: `GET`/`POST /gateway/v1/models/<class>/fields`,
`PUT`/`DELETE /gateway/v1/models/<class>/fields/<field_name>` -- the URL
segment is named `field_name`, not `name`, specifically so it never
collides with the request body's own `name` (the field's *current* name,
from the URL, versus the *new* name being saved, from the body).
`admin-app/src/components/FieldEditor.jsx` is the UI: an editable table
of existing fields (each row swaps to an inline edit form) plus an "Add
Field" form below it, seeded from the model detail response's own
`fields` array (`Model_REST_Controller::describe_model()`) so the page
doesn't need a second request just to show them.

### `Field_Type_Registry` -- one class per field type, controlling its own attributes

Rather than a flat lookup array mapping type names to behavior (which is
exactly what an earlier version of `Model_Fields` had -- a
`BLUEPRINT_METHODS` constant), each field type is its own class
implementing a small `Field_Type` interface (`includes/interface-field-type.php`),
registered the same way a model or migration class is:

```php
interface Field_Type {
	public static function key();             // "text", "number", ...
	public static function label();            // "Text", "Number", ...
	public static function blueprint_method(); // "string", "double", ...
	public static function input_type();       // the HTML <input type>
	public static function cast( $value );     // e.g. "3" -> 3 for Number
}
```

`Field_Type_Registry` (`includes/class-field-type-registry.php`) is a
thin `Registry` subclass -- the same shared `register()`/`all()`/`has()`/
`count()`/`unregister()` implementation `Model_Registry`/`Migration_Registry`
already use, with `required_base()` pointing at the `Field_Type`
interface instead of an Illuminate base class (`is_subclass_of()`, which
`Registry::register()` uses to enforce this, returns true for interface
implementation just as readily as class inheritance -- verified directly
before relying on it). `Text_Field_Type`/`Number_Field_Type`
(`includes/class-text-field-type.php`/`class-number-field-type.php`) are
the two built-ins, registered in `gateway_boot()`; a
`gateway_register_field_types` action fires right after, for a future
type to hook in the same way models/migrations already can.

`Model_Fields` now asks the registry for a type's `blueprint_method()`
wherever it used to look one up in the old constant array (every
`Schema::table()` call add()/update()/remove() generates), and for
whether a type is valid at all (`Field_Type_Registry::get( $type ) !==
null`, replacing an `array_key_exists()` check against that same old
constant). A new `Model_Fields::sanitize_record_data()` -- used by
`Records_REST_Controller`, below -- filters an arbitrary incoming array
down to just a model's own known field names and runs each surviving
value through its type's own `cast()`, so a "Number" field is genuinely
stored as a number rather than whatever raw type a request body happened
to send, and a request can never write to a column that isn't a real,
currently-defined field.

`GET /gateway/v1/field-types` (`Field_Type_REST_Controller`) exposes
`Field_Type_Registry::describe_all()` (key/label/input_type for every
registered type) -- both `FieldEditor` and the Records screen's own form
(below) build their type dropdown/`<input>` rendering from this one
request (`admin-app/src/hooks/useFieldTypes.js`) instead of each keeping
a second, hardcoded copy of "text"/"number" in JavaScript.

## Records -- a CRUD UI for a model's actual rows

A third top-level tab, alongside Models and Database: **Records**. Its
own list screen (`RecordsList`, route `/records`) is every model again,
this time with its row count, reusing `GET /gateway/v1/models` --
`Model_REST_Controller::describe_model()` already runs `$class::count()`
for each one (wrapped in a `try`/`catch`: an unreachable database or a
migration that never ran shows as "--" rather than breaking the whole
list). Clicking a model opens `RecordsCrud` (route `/records/:className`),
the actual CRUD screen: Add New, edit an existing row in place, delete
one -- the ACF-style "row becomes a form" interaction `FieldEditor`
already established, reused here for records instead of field
definitions.

**Every column and every form input comes from the model's own fields**
-- there's no separate "which columns to show" configuration anywhere.
`RecordForm` (`admin-app/src/components/RecordForm.jsx`, shared between
"Add New" and each row's own inline edit) renders one `<input>` per
field, choosing its HTML `type` from `useFieldTypes()`'s `input_type`
for that field's own `type` -- a "Number" field genuinely gets
`<input type="number">`, not a guess made independently of what
`Field_Type_Registry` already knows.

`Records_REST_Controller` is the one controller in the whole Models/
Fields/Records trio that actually touches row data:

- `GET /gateway/v1/models/<class>/records` -- paginated (`page`/
  `per_page`, capped at 100), newest-first, returning `{ records, total,
  page, per_page }`.
- `POST .../records` / `PUT .../records/<id>` -- body filtered through
  `Model_Fields::sanitize_record_data()` before ever reaching
  `$class::create()`/`$record->update()`, so an unknown key (including
  `id` itself, which isn't a *field*, just the primary key) is silently
  dropped rather than erroring or, worse, being written somewhere
  unintended.
- `DELETE .../records/<id>` -- plain `$record->delete()`.

Unlike every other route in this plugin, create/update deliberately have
**no fixed REST `args` schema** -- the set of valid keys is dynamic
(whatever `Model_Fields::all()` currently returns for that specific
model), so the body is read directly
(`$request->get_json_params()`) and validated by
`sanitize_record_data()` instead. All four actions gate on
`Database_Connection::is_healthy()` before touching the database, same
as every other write path in this plugin, and every query is wrapped in
`try`/`catch` so a real `QueryException` (a stale field pointing at a
column that's since been dropped by hand, say) comes back as a clean
`\WP_Error` rather than a fatal.

## The Gateway admin app

A single top-level "Gateway" page in wp-admin, added as the home for
configuring the Laravel-models-as-a-data-source work above (starting with
the database connection those models will use) and whatever future
model-related screens follow it. The page itself (`Admin_Page`) is nearly
empty PHP -- one `add_menu_page()` call and an empty `<div
id="gateway-admin-app">` -- everything else is a React app that mounts into
that div.

### Plain React + Vite, not `@wordpress/scripts`

Gateway's blocks build with `@wordpress/scripts`/webpack because that's what
block.json + the block editor expect. The admin app isn't a block and has
no such expectation, so it's a completely separate, self-contained project
under `admin-app/` -- its own `package.json`, its own `vite.config.js`, its
own `node_modules/` -- built with plain [Vite](https://vitejs.dev/) instead.
This keeps two unrelated build pipelines from sharing dependency versions
or config, and means the admin app can be developed like any ordinary React
project (`npm run dev` against Vite's own dev server -- see
`admin-app/README.md`).

`vite.config.js` builds a single IIFE bundle (`build/app.js` +
`build/app.css`) rather than Vite's ES-module default: React and
ReactDOM are bundled directly in, so `Admin_Page` can enqueue it with a
plain `wp_enqueue_script()`/`wp_enqueue_style()` call -- no `type="module"`,
no separate externals to also enqueue, no bundler-aware loader needed on
the WordPress side. Same idea as each block's own committed `build/`
output, just from a different bundler: **`admin-app/build/` is committed to
the repo**, so a site installing the plugin never runs `npm install`/`npm
run build` itself.

`Admin_Page::enqueue_assets()` only loads the bundle on the plugin's own
page (matched against the exact hook suffix `add_menu_page()` returns, not
a guessed string) and localizes a `window.GatewayAdmin` object (`apiUrl`,
a `wp_rest` `nonce`, the app's root element id) the same way the block
editor's own scripts receive REST connection details -- `admin-app/src/
api.js` reads it to authenticate `fetch()` calls against `gateway/v1`
routes as the logged-in administrator viewing the page.

### Models screens (list + detail)

One of the app's three tabs (alongside Records, above, and Database
Connection below), and the one at `/` -- what most visits to the page
are actually for. Routed with
`react-router-dom`'s `HashRouter` (URLs like `#/models/BlogPost`) rather
than `BrowserRouter`: this app is loaded from one single, fixed wp-admin
URL (`admin.php?page=gateway`) that WordPress's own PHP routing owns, so
there's no server-side route for a real path like
`admin.php?page=gateway/models/BlogPost` for a browser refresh or
bookmark to actually hit -- the hash fragment sidesteps needing one
entirely, while still making each model's own URL bookmarkable and the
back button behave normally.

`ModelsList` (`admin-app/src/screens/ModelsList.jsx`, route `/`) is the
Title + Plural Title form described above, plus the list of every model
that already exists (`GET /gateway/v1/models`) -- each row links to
`ModelDetail` (`admin-app/src/screens/ModelDetail.jsx`, route
`/models/:className`), which fetches that one model's detail (`GET
/gateway/v1/models/<class>`) and shows its table name plus its
migration's version and whether it has actually run. Both screens' data
comes from `Model_REST_Controller::describe_model()` -- one shared shape
for both the list and the detail view, so a status badge in the list
("✅ Ready" vs "⚠️ Migration not run") and the fuller status line on the
detail page are never at risk of disagreeing. That method resolves a
model's migration by re-deriving its class name from the model's own
table via `Model_Builder::migration_class_for_table()` -- the same
naming convention `create()` used to generate it -- rather than storing
the model-to-migration link anywhere separately.

`ModelDetail` also lets Title and Plural Title be edited and saved (`PUT
/gateway/v1/models/<class>`, `Model_REST_Controller::rename_model()` ->
`Model_Builder::rename()`, see "Renaming a model" above for what actually
happens on the PHP side). Title is pre-filled from the model's own class
name (the only thing `Model_Builder` persists for it -- there's no raw
original text stored anywhere); Plural Title from its own stored label,
blank if none was ever set. Because the two fields have very different
consequences, the page treats them differently: **only a Title change**
triggers the destructive-rename warning -- an inline notice with "Yes,
rename it"/"Cancel" buttons, appearing in place of the Save button
rather than a native `window.confirm()` popup, spelling out that the old
table and its data are gone for good. **A Plural-Title-only change saves
immediately** with no confirmation at all, since (per "Plural Title"
above) nothing destructive happens -- it's just a label update. A
successful Title-changing save navigates to the new class's own
`/models/:className` route (the old one no longer resolves to anything)
and carries the result -- including any `warnings`, e.g. the old table
failing to drop -- through React Router's navigation `state` so they can
still be shown once on arrival.

Below the Title/Plural Title form, `ModelDetail` also renders
`FieldEditor` (`admin-app/src/components/FieldEditor.jsx` -- see "Fields
(`Model_Fields`)" above for what happens on the PHP side) -- an
editable table of the model's fields plus an "Add Field" form, seeded
from the same initial `GET /models/<class>` response so it doesn't need
its own request just to render.

### Database Connection screen

The app's first (currently only) screen. Gateway's blocks read data via
`WP_Query`/$wpdb today, but the Laravel models from the section above will
query through their own **PDO** connection instead -- Eloquent doesn't
speak `$wpdb`'s mysqli protocol. This screen exists to confirm that
separate connection actually works before any model code depends on it,
and to fix the one way it commonly doesn't: **the database port**. A
database's TCP port frequently differs from MySQL's default 3306 in
practice (a Docker container mapping it to something else is the common
case) even though `$wpdb` itself keeps working fine on whatever `DB_HOST`
already resolves to -- there's normally nowhere to correct that just for
Gateway's own connection without editing `wp-config.php` (which affects
$wpdb too). This screen adds exactly that one setting.

`Database_Connection` (`includes/class-database-connection.php`) resolves
its connection settings by copying the same `wp-config.php` constants
`$wpdb` itself was built from -- `DB_HOST`/`DB_NAME`/`DB_USER`/
`DB_PASSWORD`, plus `$wpdb->charset`/`$wpdb->collate`/`$wpdb->prefix` --
reusing WordPress's own `$wpdb->parse_db_host()` to split `DB_HOST` into
host/port/socket (rather than re-implementing that parsing) so the two
connections start from an identical understanding of where the database
is. On top of that, a `gateway_db_custom_port` option can override just
the port; the screen's "Test Connection" button both saves whatever's in
the Port field (blank clears the override back to the `DB_HOST`-resolved
default) and immediately attempts a connection with it, so entering a new
port and confirming it works is one action.

One real MySQL-client quirk had to be handled explicitly: **when the
resolved host is literally the string `localhost`**, MySQL's client
libraries connect via a unix socket by default and silently *ignore* any
port at all -- which would make a custom-port override appear to do
nothing on the (very common) `DB_HOST=localhost` setup. `get_config()`
detects exactly this case (a port override is in effect *and* the host is
`localhost`) and substitutes `127.0.0.1` instead, which forces a real TCP
connection on the requested port. Verified directly: the same override
against a fake `DB_HOST=localhost` measurably switches the connection
attempt from an instant "no such socket file" failure to an actual TCP
attempt on the given port.

The PDO connection itself is opened with `PDO::ATTR_TIMEOUT => 3` (a new
`Database_Connection::CONNECT_TIMEOUT` constant) instead of PHP's own
effective default (a 30+ second socket timeout) -- a wrong port or an
unreachable host would otherwise make "Test Connection" hang for that long
before reporting failure. Verified with a connection attempt aimed at an
address that hangs rather than refuses: it failed in exactly 3.00 seconds,
confirming the shorter timeout is what's actually bounding it. The same
constant is reused wherever this connection's settings are assembled (see
`get_capsule_config()` below), so every consumer gets the fast-fail
behavior, not just the test screen.

`GET /gateway/v1/database/config` returns the current settings (never the
password) to pre-fill the screen on load, plus a `status` field (see
caching below); `POST /gateway/v1/database/test` accepts an optional
`port`, saves it via the same validation `set_custom_port()` enforces
(digits only, 1-65535, or blank), and returns `{ success, message,
latency_ms, checked_at, cached, config }` -- `message` is the raw
`PDOException` message on failure (e.g. "Connection timed out", "Access
denied for user..."), which is safe to surface since the route is gated on
`manage_options`, the same capability the page itself requires.

### Caching the health check

A live check (`Database_Connection::test()`) opens a real PDO connection
and runs a query -- worth doing when an admin explicitly clicks "Test
Connection", but not worth repeating on every single request a future
Laravel model might make. Once a database is reachable it essentially
stays that way; there's little to gain from re-verifying constantly, and
real cost (a network round trip, bounded by the 3-second timeout but not
free) in doing so. `Database_Connection::check()` wraps `test()` in a
cache -- the same "check occasionally, otherwise presume the last answer
still holds" pattern as a Laravel `Cache::remember()` health check, built
here on WordPress's own transient API (`get_transient()`/
`set_transient()`) rather than Laravel's cache facade:

```php
public static function check( array $overrides = array(), $force = false ) {
	if ( ! $force ) {
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			$cached['cached'] = true;
			return $cached;
		}
	}

	$result = self::test();
	set_transient( self::CACHE_KEY, $result, self::cache_ttl() );

	$result['cached'] = false;
	return $result;
}
```

A few decisions specific to WordPress's transient API (rather than a
straight port of the Laravel snippet this was modeled on):

- **The cached value is the whole result array, never a raw boolean.**
  `get_transient()` returns exactly `false` both when a transient is
  *missing* and when the cached value legitimately *is* `false` -- storing
  a bare success/fail boolean would make those two cases indistinguishable
  (Laravel's cache store doesn't have this ambiguity, so `Cache::remember`
  can return a raw `bool` safely). Wrapping the boolean inside an array
  that's never itself `false` sidesteps it -- `is_array( $cached )` is an
  unambiguous "was this actually cached" check.
- **Both outcomes get cached, success and failure alike** -- once *any*
  check has run, its result is presumed current for the full TTL, matching
  the provided `Cache::remember()` example's own behavior (it caches
  whatever its closure returns, unconditionally) rather than treating
  failures specially.
- **The default TTL is 15 minutes** (`Database_Connection::CACHE_TTL`,
  filterable via `gateway_db_health_cache_ttl`) -- longer than the
  1-minute example this was modeled on. The goal here is specifically to
  check *infrequently*: a working connection, once established, is
  expected to keep working, so there's more to gain from avoiding
  unnecessary checks than from catching a rare mid-flight outage a few
  minutes sooner.
- **A non-empty `$overrides` always bypasses the cache**, in both
  directions -- it represents a one-off, not-yet-persisted config (the
  admin screen never actually exercises this path currently, since
  `set_custom_port()` persists a new port *before* `check()` runs, but the
  method stays safe for a future caller that does want to try a port
  without saving it first). Caching that result under the one shared cache
  key would risk a later default-config check incorrectly reusing someone
  else's one-off result.
- **Changing the port clears the cache.** `set_custom_port()` calls
  `Database_Connection::clear_cache()` on any actual change -- a cached
  "healthy" result from the *old* port must never be presumed to describe
  the new one.
- **The admin screen's "Test Connection" button always forces a live
  check** (`check( array(), true )`), still repopulating the cache with
  whatever it finds -- a button with that exact label handing back a
  stale cached answer instead of actually checking would be misleading,
  but there's no reason to throw away a fresh, real result once it's been
  paid for.

`Database_Connection::is_healthy( $force = false )` is a thin boolean
wrapper around `check()`, added for a future call site (e.g. a Laravel
model's own code) that just wants a yes/no gate before doing real work,
without needing the full result shape `check()`/`test()` return.

The admin screen's own `GET /database/config` response now includes this
cached status (`status: { success, message, latency_ms, checked_at,
cached }`) so the screen shows the last known state -- labeled "cached,
checked Nm ago" when it is one -- immediately on load, without forcing a
live check just to render the page.

### Wiring the connection up for Laravel models to actually use

Testing a raw PDO connection doesn't by itself give a future Eloquent
`Model` class anything to query through -- Eloquent needs a connection
registered with `illuminate/database`'s Capsule manager (see "Laravel
Models" above), not a bare `$pdo` variable. `Database_Connection::
get_capsule_config()` reshapes the same settings `test()` uses into the
exact `'connections' => ['wordpress' => [...]]` array shape Laravel's own
`config/database.php` uses (driver/host/port/database/username/password/
unix_socket/charset/collation/prefix/options, `PDO::ATTR_TIMEOUT` included
in `options` the same way), and `Database_Connection::boot_capsule()`
registers it as the Capsule's global connection and boots Eloquent.
`gateway_boot()` calls this on every request (guarded, like
`vendor/autoload.php`'s own require, by a `class_exists()` check so a
missing `vendor/` doesn't fatal) -- safe to do unconditionally because
`Capsule::addConnection()` only stores settings, it doesn't itself touch
the database; the actual PDO connection stays lazy until a future model's
first real query.

**A real bug here, fixed**: registering the connection under the
descriptive name `"wordpress"` (matching the sample `'connections' =>
['wordpress' => [...]]` shape) rather than Capsule's own hardcoded
default connection name -- the literal string `"default"`, set in
Capsule\Manager's own constructor -- meant Capsule genuinely didn't know
`"wordpress"` was the one to fall back to. Every model `Model_Builder`
generates relies on exactly that fallback (none of them set their own
`$connection` property), so the very first model created failed with
`Database connection [default] not configured.` -- a config-resolution
error, not a connectivity one; it reproduced identically even against an
already-confirmed-working connection, since it happened before anything
tried to actually connect. `boot_capsule()` now also sets
`$capsule->getContainer()['config']['database.default'] = 'wordpress'`
right after registering it, which is the one line Capsule needs to
resolve an unqualified connection request (a model that never names its
own `$connection`, or `Capsule::connection()`/`Capsule::schema()` called
with no argument) to `"wordpress"` instead of erroring on `"default"`.
Verified directly: calling the real `boot_capsule()` and reading
`Model::getConnectionResolver()->getDefaultConnection()` back confirms
it resolves to `"wordpress"`, without needing a real database to connect
to (`addConnection()` itself never connects, so this check needed
nothing more than the config value actually being set correctly).

`Model_Builder::create()` also now checks `Database_Connection::
is_healthy()` (its existing health-check cache -- see "Caching the
health check" above -- not a fresh live check of its own) before writing
any files, so a genuinely unreachable database is reported clearly and
immediately rather than surfacing later as a raw exception from
somewhere inside a migration's `up()`. This wouldn't by itself have
caught the bug above -- the connection actually was healthy, which is
exactly what made the error confusing -- but it's what the health-check
cache was for, so real database unavailability gets a clear answer
without adding a second live connection attempt of its own alongside the
one the migration is already about to make.
