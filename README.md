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

### A dedicated "Gateway" block category, for the four top-level blocks

`Block_Loader::register_category()` (on `block_categories_all`, alongside
`register_blocks()`'s own `init` hook) registers one new inserter
category, `gateway`/"Gateway" -- prepended ahead of core's own categories
(Text/Media/Design/etc.), rather than appended after them, so a plugin
whose main purpose IS these blocks gets surfaced first, not buried below
groupings most of this plugin's own users have no reason to browse.

Only the four block.json files a site owner actually starts a layout
with set their own `category` to `"gateway"`: `gateway/data-cards`,
`gateway/data-display`, `gateway/datatable`, `gateway/single-record` --
recognizable as exactly the four with neither a `parent` nor an
`ancestor` restriction, the only ones ever offered from the top-level
inserter to begin with. Every other block this plugin ships (every
`datatable-*`/`data-cards-*` child, `gateway/card-field-text`/`-number`/
`-image`, `gateway/related-items`, `gateway/facet`/`gateway/card-facet`,
`gateway/pagination`) deliberately keeps its existing `"widgets"`
category untouched -- none of them are ever reachable from that
top-level list regardless of which category they claim (a `parent`
-restricted block only ever appears nested inside its one named parent;
an `ancestor`-restricted one only once already inside a matching
ancestor), so grouping them under "Gateway" too would just be dead
weight in a category no one browses looking for them.

Verified with a new standalone PHP smoke test (`register_category()`
returns core's own categories untouched plus exactly one new,
well-formed entry, prepended ahead of them) plus a second pass reading
every real `blocks/*/block.json` on disk and confirming, block by block,
that a top-level block (no `parent`/`ancestor`) is in `"gateway"` and a
child block (either restriction) is not -- alongside the full existing
regression suite. No build step needed: `category` is plain block.json
metadata `register_block_type()` reads directly, never something
webpack/`@wordpress/scripts` compiles into a block's own `build/`
output.

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

### Source: Post Type vs Collection

The very first setting is **Source** (`sourceType` attribute, default
`postType`; `controls/source-type-control.js`) -- a plain two-option
`SelectControl`, "Post Type" or "Collection" (Gateway's own term for a
Laravel model's data, see "Laravel Models" below). It decides which of
the next two controls shows: `postType` + `PostTypeControl` for "Post
Type" (unchanged from before Collections existed), or `collection` +
`CollectionControl` for "Collection" -- both stored as separate
attributes (never overwriting one another when you switch back and
forth), and both provided down to child blocks via context the same way
`postType` already was.

**`CollectionControl`** (`shared/controls/collection-control.js`) lists
every registered model (`GET /gateway/v1/models`, the same endpoint the
admin app's own Models/Records screens use), labeled by each one's
stored Plural Title (falling back to its class name).

**Columns become a model's fields.** `useAvailableColumns()` (`shared/
use-available-columns.js`) now takes an optional second argument,
`{ sourceType, collection }` -- when `sourceType` is `'collection'`, it
fetches `GET /gateway/v1/columns-for-collection/<class>`
(`Columns_REST_Controller::get_columns_for_collection()`, backed by
`Column_Registry::get_columns_for_collection()`, itself just
`Model_Fields::all( $class )` mapped into the same `{key, label, type,
isFilterable, facetType}` shape `get_columns()` already returns for post
types, plus a synthetic leading `id` column -- every model has a real
`id` primary key, but it's never one of `Model_Fields`' own user-defined
fields) instead of `GET /gateway/v1/columns/<post_type>`. Two genuinely
separate REST routes, not one with a type param: `sanitize_key()`
(needed for a post type slug) lowercases everything, which would corrupt
a model's real, case-sensitive class name before it ever reached
`Column_Registry`. Every other caller of `useAvailableColumns()`
(`gateway/facet`, `gateway/card-facet`, `gateway/data-cards`) still calls
it with just a post type string, unaffected.

Because the returned shape is identical either way, the existing Columns
panel, `AvailableColumnsList` (its "Fields" group now also matches
`model_id`/`model_field`, the same way it already folds `thumbnail` in
there), and `ColumnConfigTable` all work against a Collection's fields
with no changes of their own. The one thing that's genuinely different
is the *default* selection when nothing valid is configured: a post type
always falls back to its fixed `ID`+`post_title` default, but a model's
own field names aren't known in advance, so a Collection instead falls
back to its `id` column plus whichever field happens to be first --
computed fresh from `availableColumns` itself, both in `edit.js` (for
`useReconcileFieldList()`'s own fallback) and in `render.php` (for the
front end).

**Facets work for a Collection too** (see "Facets work for Collections
too" under the Data Cards section below for the full Eloquent-side
story -- `Column_Registry::get_columns_for_collection()`'s
`isFilterable`/`facetType` values and `Facet_Query::
apply_collection_facets()`/`get_facet_options_for_collection()` are
shared by both blocks). For `gateway/datatable` specifically: a facet's
*default value* (top-level Facets panel) is applied to the Collection's
initial Eloquent query in `gateway/datatable-body/render.php`, the same
way it already was for a post type's `WP_Query`. `gateway/facet`'s own
front-end live interaction needs no Collection-specific change at all --
it drives DataTables' client-side `column().search()` against whatever
rows are already in the rendered `<table>`, which has never cared where
those rows came from. `gateway/facet`'s own editor/render.php pieces that
DO need to know the source (resolving a facet's column definition and its
Select/Checkboxes options) branch on `sourceType` the same way `gateway/
card-facet`'s do.

**Rendering a Collection's rows** (`gateway/datatable-body/render.php`)
is a genuinely separate code path from the post type one -- a real
Eloquent query (`$collection::query()->orderBy( 'id', 'desc' )`, capped
by Limit the same way `posts_per_page` is, filterable via a new
`gateway_datatable_collection_query` PHP filter mirroring
`gateway_datatable_query_args`) in place of `WP_Query`, and a cell's
value read via `Column_Registry::resolve_collection_value( $record,
$column['key'] )` -- a plain `$record->{$key}` for one of the model's
own fields, or (see "Related Fields" below) a related record's own
field value for a `"relationship.field"` key -- rather than through
`Column_Registry::get_cell_value()` (which is fundamentally post-shaped:
`get_post_meta()`, `get_the_title()`, etc.). Everything downstream of the rendered
`<table>` -- DataTables' own client-side sorting, searching, and
pagination, Page Size, Results text -- needs no changes at all: none of
it has ever cared where the table's rows actually came from, only that
they exist in the DOM already sorted/paginated/filtered client-side (see
`gateway/datatable-body/render.php`'s own docblock -- this plugin has
never done server-side DataTables processing).

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
Input only -- a **Compare** (`controls/compare-control.js`): the full
`FACET_COMPARE_OPTIONS` vocabulary (Equals, Not Equals, Greater Than,
Greater Than or Equal, Less Than, Less Than or Equal, Contains, Does Not
Contain) -- the same list, and the same real operator values, the
top-level Facets panel's own Default-value modal already offers, so a
Number/Range field's *live* facet can do a real "Estimated Hours > 2" too
(see "Real comparison operators for the live filter, not just Contains/
Equals" under Front-end hookup below for how `view.js` actually backs
each one up). This is deliberately separate from, and unrelated to, the
*preset* `compare` set on the Data Table block's Facets panel: that one
is baked into the initial server-side query; this one governs how the
*live*, client-side filter matches as a visitor types -- but as of this,
both draw from the identical vocabulary, for consistency between the two
places a comparison operator can be chosen. Not shown for Select/
Checkboxes, since exact match is the only behavior that makes sense
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
(`src/edit.js`'s `FacetPreviewContent`, which doesn't run through render.php)
shows a one-line note naming the preset value, so a site owner sees while
editing that the table is already narrowed, the same thing a visitor
would see live.

### The editor preview's Select/Checkboxes options are real, not a placeholder

`FacetPreviewContent` used to render exactly one static, hardcoded thing
for Select ("All", or the preset value) and Checkboxes ("Example value")
regardless of what the field's real options actually were -- reasonable
for "just show what kind of control this will be" as its own docblock
originally put it, but Checkboxes' literal "Example value" text read as
obviously broken, and neither actually reflected the field's real values
the way `render.php` always has on the front end.

**`Facet_Options_REST_Controller`** (new) exposes the same discovery
`render.php` already uses -- `GET /gateway/v1/facet-options/<post_type>?key=<field>`
and `GET /gateway/v1/facet-options-for-collection/<class>?key=<field>`
(two routes, not one with a type param, for the usual
`sanitize_key()`-corrupts-a-class-name reason), thin wrappers around
`Column_Registry::get_column()`/`get_column_for_collection()` +
`Facet_Query::get_facet_options()`/`get_facet_options_for_collection()`.
Same permission gates as `Columns_REST_Controller`'s own two routes
(per-post-type `edit_posts`, or `manage_options` for a Collection) --
reused directly (`array( Columns_REST_Controller::class, 'permissions_check' )`)
rather than duplicated.

**`shared/use-facet-options.js`** (new hook, `useFacetOptions({ sourceType,
postType, collection, facetKey, uiType })`) fetches from whichever route
applies, skipping the request entirely when it wouldn't return anything
useful (`uiType` is "input", no `facetKey` chosen yet, or -- for a
Collection -- no Collection chosen yet). Both `gateway/facet` and
`gateway/card-facet`'s own `edit.js` call it and pass the result into
`FacetPreviewContent`, which now maps over the real `options` list for
both UI types -- Select gets a real `<option>` per value (still `disabled`,
matching every other editor preview control in this plugin), Checkboxes
a real, disabled checkbox per value, the preset's own value pre
-selected/checked in both. Checkboxes shows an explicit "No values found
for this field yet" message instead of a fake example when the field
genuinely has none yet, rather than inventing placeholder text.

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
3. Wires interaction, reading the block's own `data-compare` for the Input
   control -- always one of `Facet_Query::ALLOWED_COMPARE`'s own real
   operator values (`render.php` normalizes it, including a stored legacy
   `'contains'`/`'equals'` value from before this vocabulary was unified
   plugin-wide, forward to `'LIKE'`/`'='`). Two genuinely different
   mechanisms back these, split by what DataTables' own API can actually
   express:
   - **`'LIKE'`** (Contains, default) **and `'='`** (Equals), plus
     **Select**/**Checkboxes** (always exact, regardless of `data-compare`
     -- that attribute only ever governs Input): `column.search(...).draw()`,
     DataTables' own built-in per-column search -- a plain substring
     (`LIKE`) or, for `'='`/Select/Checkboxes, an anchored regex built by
     `exactMatchPattern()` for an exact match rather than DataTables'
     default substring behavior (picking one option shouldn't also match
     every other value that happens to contain it as a substring). Values
     are regex-escaped first, debounced 300ms for Input.
   - **Every other operator** (`>`, `>=`, `<`, `<=`, `!=`, `'NOT LIKE'`):
     see "Real comparison operators for the live filter" immediately below
     -- `column().search()` has no way to express these at all, so they
     go through a different DataTables extensibility point entirely.

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

### Real comparison operators for the live filter, not just Contains/Equals

`column().search()` -- what the Contains/Equals branch above uses -- is
DataTables' *per-column text search* API: a plain substring or regex
match against a cell's own search data, with no numeric-comparison or
negation concept built in at all. A real "Greater Than"/"Does Not
Contain"/etc. facet needs a genuinely different DataTables extensibility
point: `$.fn.dataTable.ext.search` -- a single, global array of plain
functions, each run against **every row on every `draw()`** (of **every**
DataTable instance on the page, since the array isn't scoped to one
table), returning whether to include that row. This is DataTables' own
documented mechanism for exactly this case (its own "range filtering"
example uses the identical approach).

- **`registerCustomCompareFilter()`** pushes one such function per facet
  instance -- once, not re-pushed on every keystroke, since every
  already-registered function reruns automatically on every `draw()`. The
  function itself does two things before considering the row at all:
  bails out (`return true`, impose no filter) if `settings.nTable !==`
  this facet's own `<table>` (the array being global and shared means a
  function that didn't scope itself this way would filter *every*
  DataTable on the page, not just its own), and bails out the same way
  while the input is empty (a facet with nothing typed into it yet must
  never hide rows). The input's own `input` listener (debounced 300ms,
  same as the Contains/Equals branch) only updates a closure variable this
  function reads and calls `dataTable.draw()` -- the redraw is what
  actually reruns every registered filter function, this one included,
  against the (unchanged) row data.
- **`compareValues( compare, cellValue, inputValue )`** is the actual
  comparison, run once per row by that function: for `'NOT LIKE'`, a
  case-insensitive substring check, negated. For the four numeric
  operators (`>`, `>=`, `<`, `<=`) and `'!='`, both sides are parsed with
  `parseFloat()` first -- if *both* parse as real numbers, the comparison
  is numeric (so a Number/Range field's "Estimated Hours > 2" behaves
  exactly like the same comparison already does server-side, via
  `Facet_Query::apply_collection_facets()`'s own `where()` call against a
  real numeric column); otherwise it falls back to a plain string
  comparison, so choosing "Greater Than" against non-numeric text still
  does something coherent (lexicographic ordering) instead of silently
  matching nothing.
- The row value being compared is `searchData[columnIndex]` -- confirmed
  directly against DataTables' own source
  (`node_modules/datatables.net/js/dataTables.js`'s `_fnFilterCustom()`,
  which calls every registered function as
  `filters[i]( settings, row._aFilterData, rowIdx, row._aData, j )`) to be
  the exact same per-column **filter data** `column().search()` and the
  global search box already match against -- i.e. a cell's `data-filter`
  attribute when present, its rendered text otherwise. One value, one
  source of truth, regardless of which of the two mechanisms above ends
  up reading it.

`view.js` importing plain `'jquery'` directly (for `$.fn.dataTable.ext.search`)
is the same safe case `shared/wait-for-datatable.js`'s own docblock
already establishes for this file -- it never touches the
`'datatables.net-dt'` plugin module itself (confirmed in the rebuilt
bundle: no `datatables.net` string present at all), only the shared,
externalized jQuery instance the plugin later attaches its own
extensions onto elsewhere. `gateway/facet`'s own `CompareControl` usage
(editor) now offers the full vocabulary too, matching `gateway/card-facet`'s
-- see "Configuring a facet block" above.

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

### Swapping the card template on a Source (or Collection) switch

The default starter template -- Featured Image + Title + Excerpt -- is
built entirely from core WordPress blocks that only know how to read a
real post; switching the parent `gateway/data-cards`'s Source to
Collection leaves it pointed at content that renders nothing at all for
a model record. And once in Collection mode, switching to a *different*
Collection can leave the template with more `gateway/card-field-text`
blocks than the new model has fields for (a template built for a
3-field model, pointed at one with only 1), each extra one now
referencing a `fieldKey` that doesn't exist at all. Rather than
requiring a site owner to manually fix the template by hand every time
either happens, `edit.js` does it for them via `replaceInnerBlocks()` --
a full reset each time, discarding whatever was there before, never a
merge: the whole point is to never leave behind blocks the current
selection can't back up.

Two `useEffect`s drive this. The first watches both `sourceType` AND
`collection` (via two `useRef`s tracking their *previous* values) and
detects either kind of real change -- never firing just from loading an
already-configured instance, since both refs' initial values always
match the current attributes, so a merely-opened block's own
deliberately-authored template is never touched:

- **Collection → Post Type**: back to `TEMPLATE` itself (the same
  Featured Image/Title/Excerpt starter a brand-new block gets).
- **Post Type → Collection, OR Collection → a *different* Collection**:
  queues a rebuild (`isCollectionSwapPending`), performed by the second
  effect once that Collection's own fields are actually known.

The second effect -- watching `collectionFields`/`isLoadingCollectionFields`
(`useAvailableColumns( '', { sourceType: 'collection', collection } )`,
the same call every other field-picker in this plugin already uses) --
performs the queued rebuild once the fetch resolves: the first
`COLLECTION_FIELD_COUNT` (3) of the *current* Collection's own available
fields become that many `gateway/card-field-text` blocks, one per field,
via `createBlock( 'gateway/card-field-text', { fieldKey } )`. Fewer than
three if the Collection doesn't have that many -- always at least one,
since `get_columns_for_collection()`'s own leading synthetic `id` column
means there's never genuinely nothing to offer -- and *exactly* however
many the current model actually has, sliced fresh from its own field
list every time a rebuild runs, so switching to a smaller model never
leaves the larger model's extra blocks behind. If no Collection is
chosen yet (or its fields are still loading when the queue is set), the
rebuild simply waits -- re-evaluated whenever `collectionFields`/
`isLoadingCollectionFields` next change -- rather than replacing the
template with an empty one before a model has even been picked.

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
exists for cards) -- `FacetKeyControl` (help text genericized) and
`UiTypeControl` (gains an optional `allowedTypes` prop, trimmed here to
the selected field's own `facetType`) are reused as-is from their new
`shared/controls/` home. `CompareControl` is reused too, but with the
one deliberate difference described below: unlike `gateway/facet`,
`gateway/card-facet` doesn't pass it a narrower `options` list, so it
offers the full comparison vocabulary. Its own front end (`view.js`)
doesn't build a request payload itself: `shared/cards.js`'s
`fetchCardsPage()` already gathers every currently-active card-facet
under the same grid on *every* fetch (`collectActiveFacets()` -- searches
`.gateway-card-facet` elements, reads each one's current value(s) by its
`data-ui-type`, forwarding its `data-compare` straight through as the
real operator -- see "Full comparison-operator support" below), so a
Pagination click or Page Size change never silently drops an active
filter, and `gateway/card-facet`'s own `view.js` just needs to trigger a
fetch (debounced 300ms for the `input` UI type, matching `gateway/facet`'s
own and `gateway/data-cards-search`'s reasoning).

Because each card-facet's own DOM value already reflects its default
(pre-filled server-side by `render.php`, the exact same "Facets panel
preset" mechanism `gateway/facet` already uses) unless a visitor changed
it, `collectActiveFacets()` naturally captures the full effective filter
state -- defaults and live edits alike -- with no separate merge step.
And since `gateway/data-cards/render.php` now also resolves, validates,
and applies its own `facets` attribute to the *initial* query (the one
real change to that file for this feature), a configured default value
takes effect on first paint, exactly like the table.

## Data Cards: a Collection data source + field-display blocks (`gateway/card-field-text`)

`gateway/data-cards` gains the same **Source: Post Type vs Collection**
choice `gateway/datatable` already has (see that section above for the
shared pieces -- `SourceTypeControl`/`CollectionControl`,
`useAvailableColumns()`'s `{ sourceType, collection }` argument,
`Column_Registry::get_columns_for_collection()`), plus one thing the table
never needed: a way to display a *value* at all, since a card's contents
are arbitrary user-authored InnerBlocks (Post Title, Post Excerpt, ...) --
core blocks that only know how to read a WordPress post, not a Gateway
model's own fields. `gateway/card-field-text` is the first of what's meant
to grow into a small family of field-display blocks (Text today; Number,
Image, Date, etc. are natural, not-yet-built next additions along the same
pattern).

### The Source setting, on the parent block

New `sourceType`/`collection` attributes on `gateway/data-cards` itself
(default `'postType'`/`''`), both `providesContext`'d down the same way
`postType`/`limit`/`pageSize`/`facets` already are. Because
`get_columns_for_collection()` marks every one of its columns
`isFilterable: false` (no Eloquent equivalent to `Facet_Query` exists
yet -- same documented limitation as the table), switching Source to
Collection naturally empties the block's own Facets panel with no extra
check needed there.

### Rendering a Collection's cards

`gateway/data-cards/render.php` branches on `sourceType` the same way
`gateway/datatable-body/render.php` already does, into a second, fully
independent path:

- **`Data_Cards_Renderer::get_collection_page( $collection, $page,
  $page_size, $limit, $facets = [] )`** -- the Eloquent counterpart to
  `get_query_args()`/`build_pager_meta()` combined into one call (an
  Eloquent `Builder` needs a genuinely separate `->count()` before the
  paginated `->get()`, unlike `WP_Query`'s `found_posts`). Same
  zero-based `page`/boundary-clamping semantics as the post path,
  filterable via a new `gateway_data_cards_collection_query` hook
  mirroring `gateway_datatable_collection_query`. `$facets` is applied
  (via `Facet_Query::apply_collection_facets()`) right after that
  extensibility filter, before `->count()`, so a site's own query
  narrowing and a visitor's own facet choices compose the same way the
  postType path's `get_query_args()` + `apply_facets()` already do -- see
  "Facets work for Collections too" below. No search support yet:
  Eloquent has no built-in equivalent to `WP_Query`'s own `s` full-text
  search, and building one (which field(s) to search, how to weight
  them) is real, separate, undone work.
- **`Data_Cards_Renderer::render_items_for_collection( $records,
  $template_blocks )`** -- the Collection counterpart to `render_items()`:
  same `core/null`-wrapper-block trick, but instead of injecting
  `postId`/`postType` into block context per iteration, it injects the
  *actual Eloquent model instance* under the plain, unnamespaced key
  `record` (matching how core's own `postId`/`postType` aren't namespaced
  either). Passing the instance itself -- not just its id -- means every
  field-display block within the same card shares the one record already
  fetched here, rather than each one re-querying it independently.
- A blank/invalid Collection selection renders one informational `<li>`
  ("Choose a Collection...") in place of the card template, the same
  degrade-gracefully approach `gateway/datatable-body` uses.
- The template transient (`Data_Cards_REST_Controller`'s own
  security boundary -- see that class's docblock) is salted with the
  collection's class name instead of a post type slug, so a Post-sourced
  and Collection-sourced Data Cards block with byte-identical card
  templates never collide on the same key.

**`Data_Cards_REST_Controller`** gains a second, genuinely separate route
-- `GET /gateway/v1/data-cards-collection/<class>` -- for the same
`sanitize_key()`-would-corrupt-a-class-name reason
`columns-for-collection` is its own route rather than a shared one with a
type param. It accepts `template_id`/`page`/`page_size`/`limit`/`facets`
(no `search`, per the search limitation above), and its callback is a
thin wrapper around `get_collection_page()` + `render_items_for_collection()`.
Public, same rationale as the post-type route: front-end pagination for
data this same page already rendered once with no permission check
either.

### Facets work for Collections too

`Column_Registry::get_columns_for_collection()` marks a model's own
fields `isFilterable` (mirroring the UX judgment `FILTERABLE_CORE_COLUMNS`/
`get_meta_columns()` already make for post columns, using each field's
own `Field_Type` -- something a post type's meta columns don't have):
a field type declares whether it's ever a sensible thing to filter/facet
by at all via a new `Field_Type::is_filterable()` (added to the base
interface, so every registered type -- including a future one -- must
say one way or the other, rather than this method hardcoding its own
per-type/per-`is_subclass_of()` exclusion list to keep in sync by hand).
`false` for `Password_Field_Type` (a secret value has no legitimate
reason to be searchable/facetable at all) and for
`Relate_To_One_Field_Type`/`Relate_To_Many_Field_Type` (a relate field's
own stored value -- a bare foreign-key id, or nothing at all for Relate
to Many -- was never a meaningful thing to facet by: a Select/Checkboxes
built from raw, unlabeled ids would be actively confusing, and
`Facet_Query` has no notion of filtering *through* a relationship in the
first place -- reported directly as "relationship fields are not
suitable for filtering... skip it in the facet list," fixed by adding
this declaration rather than a one-off exclusion). `true` for every
other built-in type; of those, a TextArea field is still free text
(`facetType: ['input']` only, the same "a Select of every distinct value
would be unusable" reasoning `post_content`/`post_excerpt` already get),
every other filterable type gets the full `['input', 'select',
'checkboxes']` vocabulary, the same default as post meta. A new
`gateway_datatable_collection_facet_type` filter still lets a site
narrow this further on top, mirroring `gateway_datatable_meta_facet_type`.
Because this is the exact same method `gateway/datatable`'s own Facets
panel/`gateway/facet` already use, this benefits both blocks (and
`gateway/data-cards`'s own Facets panel/`gateway/card-facet`) at once,
with no JS changes needed anywhere -- every one of those already reads
`isFilterable` off whatever `Column_Registry` hands it, never re-deriving
it from a field's type on their own; see the "Facets work for a
Collection too" note under the Data Table section above for what changed
there specifically.

**`Facet_Query` gains two Eloquent counterparts** to its existing
`WP_Query`-only methods:

- **`apply_collection_facets( $query, $facets )`** -- the counterpart to
  `apply_facets()`. A Gateway model's own fields are just real columns on
  its own table, so there's only one "type" of column to handle here,
  unlike `apply_facets()`'s meta/taxonomy/core branching: every facet is
  just a `where()`/`whereIn()` call. An array `value` (a Checkboxes facet
  with more than one box checked) OR-matches via `whereIn()`, same
  convention as `apply_facets()`.
- **`get_facet_options_for_collection( $collection, $column )`** -- the
  counterpart to `get_facet_options()`: distinct values currently in use
  for a field, via a real Eloquent query (`->distinct()->pluck()`)
  instead of a direct `$wpdb` scan. No taxonomy-equivalent branch -- a
  Gateway model has no notion of one. Cached the same way (and under the
  same `gateway_datatable_facet_values_cache_ttl` filter) as
  `get_facet_options()`'s own post/meta/taxonomy values.

**`gateway/data-cards`'s own top-level Facets panel needed no changes at
all** to start offering a Collection's fields: it already computes its
offered list as `availableColumns.filter(c => c.isFilterable)`, so
marking those columns filterable in `Column_Registry` was the only thing
needed. Its own `render.php` resolves + validates the block's configured
`facets` attribute against `get_columns_for_collection()` (same
`Facet_Query::validate_facets()` call the postType branch already makes)
and passes the result into `get_collection_page()`'s new `$facets`
parameter, so a configured default value narrows the grid on first paint,
exactly like the postType path.

**`gateway/card-facet`** gains `gateway/data-cards/sourceType`/
`gateway/data-cards/collection` in its own `usesContext` (it lives inside
`gateway/data-cards-facets`/`-header`/`-footer`, or directly under
`gateway/data-cards` itself -- never inside `gateway/data-cards-body`'s
own synthetic per-record wrapper, so this context is always the real
thing, propagated normally -- see `gateway/card-field-text`'s own section
above for the contrasting case where it isn't). Its `edit.js`/`render.php`
branch on `sourceType` to resolve a facet's column definition and its
Select/Checkboxes options via `Column_Registry::get_column_for_collection()`/
`Facet_Query::get_facet_options_for_collection()` in place of their
postType counterparts -- everything else (the "still configured on the
parent" check, the actual `<input>`/`<select>`/checkboxes markup,
`data-facet-key`/`data-ui-type`/`data-compare` attributes) is unchanged,
since `shared/cards.js`'s `collectActiveFacets()` and the REST fetch it
drives were already source-agnostic (they just read whatever's currently
in the DOM).

### Full comparison-operator support (`gateway/card-facet`'s live Compare)

Marking Collection fields filterable surfaced a real gap: `gateway/card-facet`'s
own **Compare** control (for the "Input" UI type) only ever offered
"Contains"/"Equals" -- fine for text, but no way to build something like
"Estimated Hours > 2" on a Number field, even though the backend
(`Facet_Query::apply_collection_facets()`/`apply_facets()`) already fully
supports `=`, `!=`, `>`, `>=`, `<`, `<=`, `LIKE`, `NOT LIKE` -- the exact
same `FACET_COMPARE_OPTIONS` vocabulary the top-level Facets panel's own
Default-value modal already offers. There was never a backend reason for
the *live* control to offer a narrower menu than the *default* one --
only an unnecessarily restrictive front-end control.

- **`CompareControl`** (`shared/controls/compare-control.js`) now
  defaults to the full `FACET_COMPARE_OPTIONS` list, with an optional
  `options` prop for a caller that genuinely needs to narrow it.
  `gateway/card-facet`'s own usage passes nothing, so it gets all eight
  operators.
- **`gateway/facet`** (Data Table) initially still passed a narrower
  `options` list here (Contains/Equals only), since its own *live*
  interaction drives DataTables' client-side `column().search()` -- a
  plain substring/regex match with no numeric-comparison concept at all,
  unlike `gateway/card-facet`'s REST-driven fetch, which reaches the same
  `Facet_Query::apply_facets()` the *default* value already does. That
  restriction was later lifted for real (see "Real comparison operators
  for the live filter, not just Contains/Equals" under the Data Table's
  own Facets section above, and `blocks/facet/src/view.js`): a genuinely
  different DataTables extensibility point (`$.fn.dataTable.ext.search`,
  not `column().search()`) backs the operators that API can't express,
  so `gateway/facet` now passes no `options` override either and offers
  the identical full vocabulary `gateway/card-facet` does. Both blocks'
  own private "contains"/"equals" strings were renamed to the real
  `LIKE`/`=` operators (`block.json`'s default, `render.php`'s validation,
  and each block's own front-end comparison), with the old values still
  recognized and translated forward for an already-published block --
  one vocabulary, one menu, everywhere now.
- **`shared/cards.js`'s `collectActiveFacets()`** no longer translates a
  card-facet's `data-compare` through a second, narrower vocabulary --
  `render.php` already normalizes it to one of the real operators before
  it ever reaches the DOM, so it's forwarded as-is. The server still
  re-validates it (`Facet_Query::sanitize_compare()`) regardless of what
  a facet element's own markup claims.
- **`Facet_Query::apply_facets()`'s meta branch** gains a `'type'` key on
  its `meta_query` clause: `NUMERIC` when the compare operator is one of
  `>`/`>=`/`<`/`<=`, `CHAR` otherwise. Without this, WP's own
  `WP_Meta_Query` compares as `CHAR` by default, so "Greater Than" against
  a numeric-looking meta value would sort lexicographically ("10" <
  "9") instead of numerically -- choosing one of those four operators for
  a facet is itself a declaration that the value should be compared as a
  number.

### Editor preview: real records, not just posts

`gateway/data-cards-body/src/edit.js`'s existing per-post preview
mechanism (a `BlockContextProvider` per queried post, one active/editable
at a time, the rest hidden `useBlockPreview()` clones -- ported from
`core/post-template`'s own edit.js) gains a Collection branch: instead of
`getEntityRecords( 'postType', ... )` (core-data has no notion of a
Gateway model), it fetches `GET /gateway/v1/models/<class>/records`
directly via `apiFetch` -- the same route the admin app's own Records
screen already uses (gated on `manage_options`, so this is only ever
attempted for someone who could already configure a Collection-sourced
block in the first place). Each fetched record becomes a
`BlockContextProvider` supplying `{ record }` under that same
unnamespaced `record` key, so `gateway/card-field-text` sees an actual
value in the editor too, not just on the front end.

### `gateway/card-field-text`

A dynamic, leaf block, insertable anywhere *within* `gateway/data-cards-body`'s
own subtree -- not just as its direct child (`block.json`'s `ancestor`,
not `parent`: `parent` would only allow this block immediately under
`gateway/data-cards-body` itself, but a card's own layout very reasonably
wants it nested inside a `core/columns`/`core/group`/etc. placed there
instead, e.g. two fields side by side in a row). `ancestor` permits that
-- any depth, as long as `gateway/data-cards-body` is somewhere above it
-- with zero effect on how context reaches it: `usesContext` resolution
was never tied to `parent`/`ancestor` in the first place, only to the
real block tree at render time (the same reason `gateway/card-field-text`
already works correctly nested inside arbitrary layout blocks for
context purposes -- this only changes where the *inserter* allows it to
be placed). `usesContext` lists
`gateway/data-cards/sourceType`, `gateway/data-cards/collection` (the
true, `providesContext`-based context chain from the parent
`gateway/data-cards`), and the plain `record` key described above. Its
one attribute, `fieldKey`, is chosen from a `SelectControl` fed by
`useAvailableColumns( '', { sourceType: 'collection', collection } )` --
the exact same hook, and the exact same REST route
(`columns-for-collection`), the table and the top-level Facets panel
already use. This is what makes the field list "an accurate list of only
the available fields for that model type": it's re-fetched automatically
whenever the parent's Collection changes, never a hardcoded or stale
guess, and a field that's since been removed from the model surfaces as a
"no longer exists" warning in the Inspector rather than silently
rendering nothing.

**`render.php` deliberately does NOT read `gateway/data-cards/sourceType`/
`gateway/data-cards/collection` from context**, even though `edit.js`
does (for its field picker above) and both are declared in `usesContext`.
On the front end this block is a descendant of the *synthetic* wrapper
block `render_items_for_collection()` constructs fresh per card
(`new WP_Block( $wrapper_block )`, no `$available_context` argument) --
entirely outside the real `gateway/data-cards` -> ... ->
`gateway/data-cards-body` tree, so it never inherits that tree's own
`providesContext` chain. Only what a `render_block_context` filter
explicitly injects while that synthetic tree renders reaches it -- exactly
how WordPress core's own `render_block_core_post_template()` gets
`postId`/`postType` to Post Title/Post Excerpt -- and
`render_items_for_collection()` only ever injects the one thing this
block actually needs: the unnamespaced `record` key. Reading
`sourceType`/`collection` from context here would silently read back
whatever `WP_Block` defaults an absent context key to (`'postType'`/`''`),
never the real values -- exactly what made every card render empty before
this was caught and fixed. `render.php` instead derives the model class
directly off the record itself (`get_class( $record )`, always correct by
construction, no context needed), then re-validates `fieldKey` against
`Column_Registry::get_columns_for_collection()` the same defensive way
every other block in this plugin re-validates a configured key against
its own current availability -- a stale field name must never surface
whatever attribute happens to share its name on the Eloquent record
instead (`id`, timestamps, anything else Eloquent exposes that isn't a
real, user-defined field). The value itself is read via
`Column_Registry::resolve_collection_value( $record, $field_key )` (see
"Related Fields" below for why this isn't just `$record->{$field_key}`
anymore) and printed with `esc_html()` for a plain-text field, or as
real, trusted HTML for a WYSIWYG one (see below) -- later field-display
blocks (Number, Date, Image, ...) are expected to follow this same shape
(one block per "how to render this field's value") with their own
type-appropriate output instead.

**Not every field belongs in this block's own picker.** A Password
field's raw value is a secret with no legitimate reason to be printed as
public text; a Relate to One field's raw stored value is a bare
foreign-key id, not a related record's own label; a Relate to Many
field's own "field" isn't a real column at all -- its name is the
relationship's own method name, so reading it as a plain attribute
returns the relationship itself (an `Illuminate\Support\Collection`),
which `(string)` can't cast and would fatal error. Each `Field_Type`
declares this about itself via a new `is_text_renderable()` (the same
"a type declares it about itself" pattern `is_filterable()` already
established), which `Column_Registry::get_columns_for_collection()`
surfaces per column as `isTextRenderable`: `false` for Password/Relate to
One/Relate to Many, `true` for every other built-in type. `edit.js`'s own
Field picker filters both the model's own fields and its Related Fields
(below) down to just the renderable ones before building its options
list, and `render.php` applies the identical filter to `fieldKey` itself
-- not just "does this column still exist" -- so a field configured
before this existed, or one whose type changed into a non-renderable one
since, is rejected the same way a genuinely removed field already was,
rather than ever printing a secret or crashing on an uncastable value.

**Also displays a WYSIWYG field's own value, as real HTML -- per a
direct request** ("the text field should be able to display WYSIWYG
fields... be sure we render any HTML because the WYSIWYG produces line
breaks"), rather than a second, near-identical block existing solely to
flip one rendering detail. A new, separate `Field_Type::is_html_renderable()`
(`isHtmlRenderable` via `Column_Registry`) is what makes this possible
without disturbing `is_text_renderable()`'s own existing contract: that
flag specifically means "safe to print AS PLAIN TEXT," which every OTHER
consumer of it (`Permalink_Field_Type`'s own Source Field eligibility, a
Select/Checkboxes facet's own comparison, the admin app's own Records
table cell display) still needs to mean exactly that -- genuine HTML is
neither meaningfully slugifiable nor safe to compare/display as a raw
string, so flipping `is_text_renderable()` to `true` for `WYSIWYG_Field_Type`
instead would have quietly broken all three. `true` only for
`WYSIWYG_Field_Type`, `false` for every other built-in type (`Text_Area_Field_Type`'s
own plain multi-line string included -- already covered by
`is_text_renderable()`, with no HTML of its own to trust). `edit.js`'s
own Field picker now offers a field whenever EITHER flag is `true`, and
its own live preview renders a WYSIWYG field's value via
`dangerouslySetInnerHTML` (real markup, matching what render.php prints)
rather than as escaped plain text. `render.php` checks the SAME flag,
per resolved field, to decide `esc_html()` vs. printing the value
completely raw -- safe for the same reason a WordPress Post's own
`post_content` already gets that trust from core: a WYSIWYG field's
value only ever reaches this block through `RecordForm`'s own classic
editor, itself gated behind the exact same `manage_options`-only REST
write path (`Records_REST_Controller::permissions_check()`) a
single-site admin's own `unfiltered_html` capability already covers.

Verified with a new standalone PHP smoke test (`Field_Type_Registry::
describe_all()`'s own `is_html_renderable` exposure; `Column_Registry`'s
own `isTextRenderable`/`isHtmlRenderable` pair for a model's own Text/
WYSIWYG/Password/Relate to Many fields AND a related model's WYSIWYG
field; the exact eligibility decision `render.php` makes from those two
flags; and, end to end, a real record's own Text value staying escaped
-- even one deliberately made to LOOK like markup -- while its own
WYSIWYG value prints completely raw) alongside the full existing
regression suite, plus a successful production build of the updated
block. The live editor preview's own `dangerouslySetInnerHTML` rendering
needs manual verification in a real block editor, the same caveat every
other block-editor-only UI change in this plugin already carries.

**Styling supports now mirror `core/paragraph`'s -- make this block as
easy as possible to style for a design, per a direct request.**
`block.json`'s own `supports` used to offer only `typography.fontSize`;
it now carries the same set `core/paragraph` itself does (confirmed
directly against Gutenberg's own `packages/block-library/src/paragraph/block.json`):
Color (text/background/gradient/link), Spacing (Margin AND Padding --
named explicitly in the request), Border (color/width/style/radius),
and the full Typography set -- font family and weight named explicitly
in the request, alongside line-height, style, letter-spacing, text
-transform/-decoration/-align/-indent/-columns, writing mode, and
"fit text." Two things deliberately DON'T mirror `core/paragraph`
exactly: `className` support is left at its normal default (`true`)
rather than copied as `core/paragraph`'s own unusual `false` -- an
"Additional CSS Class" field is exactly the kind of hook a design would
want, working directly against the whole point of this change to
disable it; and `splitting`/`__unstablePasteTextInline`/`interactivity`/
the `textIndent`-specific sibling `selectors` rule are all genuinely
rich-text-editing concerns with nothing to apply to here (this block has
no directly-typed/pasted content at all -- its value always comes from
the record via `fieldKey`).

The one real PHP piece this needed: `<span>`'s own plain, browser
-default `inline` display would otherwise silently swallow the new
Margin support entirely (vertical margin has no effect at all on a
strictly `inline` element, and vertical padding can visually overlap
the line above/below it) -- exactly the "I set a margin and nothing
happened" surprise this whole change exists to avoid. Both `render.php`
(via `get_block_wrapper_attributes()`) and `edit.js` (via
`useBlockProps()`) now also pass their own `display: inline-block` --
both functions merge a passed `class`/`style` with whatever the Color/
Spacing/Border/Typography supports already generated, never overwriting
either, so this needed no new stylesheet of its own. `inline-block`
specifically (not `block`, and not changing the underlying `<span>` tag
itself to `<p>`/`<div>`) keeps this from forcing a line break: the block
is routinely used sitting inline next to other content within a card,
not only on its own line the way `core/paragraph` itself normally is.

Verified with a clean production build; block.json's own `supports`
shape and the real, visible effect of every new control (in both the
Inspector and on an actual front-end page) need manual verification in
a real block editor, the same caveat every other block-editor-only UI
change in this plugin already carries.

### `gateway/card-field-number` -- a second field-display block, with Currency/Percent/decimal formatting

The first of the "later field-display blocks (Number, Date, Image, ...)"
`gateway/card-field-text`'s own section above already anticipated --
structurally its identical twin (same `ancestor`, same `usesContext`,
same "re-check the field against live availability, never trust the
editor's own picker" `render.php` discipline), with two real
differences: its own Field picker is filtered to **`Field_Type::
is_numeric()`** instead of `is_text_renderable()` -- `true` only for
`Number_Field_Type`/`Range_Field_Type` (both store a genuine PHP int/
float; every other built-in type, `True_False_Field_Type` included, is
`false` -- a boolean is a real stored value too, but not a *quantity*
anyone would want a currency symbol or decimal places applied to) --
and a second attribute, `numberFormat`, formats the resolved value
before it's ever printed.

**`Number_Formatter`** (a new, pure static class, the same "one class,
not duplicated logic in every render.php" shape `Data_Cards_Renderer`
already has) is the formatting itself -- a small, fixed "common
options" vocabulary rather than an open-ended format string, so a site
owner picking from three clearly-labeled `<select>` options can't
produce a malformed result the way a free-text ICU/`sprintf()`-style
pattern could:

- **Style** -- Plain Number, Currency (adds a symbol), or Percent (adds
  a trailing `%`; the stored value IS the percentage already -- 45
  becomes "45%" -- not a 0-1 fraction needing its own ×100).
- **Decimal Places** -- 0-6, clamped.
- **Thousands Separator** -- on/off comma grouping.
- **Currency Symbol** / **Position** -- free text (defaults to `$`) and
  before/after the number -- `format( 4.55, ['style' => 'currency'] )`
  is the exact `$4.55` example that shaped this feature.

`sanitize_settings()` fills in/validates every key against sensible
defaults (an unrecognized style/position, a non-numeric or
out-of-range decimals, or a blank currency symbol all silently fall
back rather than producing a malformed or empty result), and `format()`
itself returns `''` for anything that isn't a real number (`null`, `''`,
a non-numeric string) -- never a stray "0" for a Number field nobody
ever filled in. Negative numbers are handled explicitly rather than
leaning on `number_format()`'s own built-in sign placement, specifically
so a negative Currency value reads as "-$4.55", not "$-4.55" (the sign
belongs before the symbol, not inside the digits). `formatNumber()`
(`blocks/shared/number-format.js`) is a JS mirror of the exact same
rules, used ONLY for a live editor preview (this block's own `edit.js`,
and a preview line inside the shared format controls below) -- every
REAL render, front end or `<ServerSideRender>`-backed editor preview
alike, goes through the real PHP class instead, so this only ever has
to be "close enough" for a momentary preview, never byte-for-byte
authoritative.

**`NumberFormatControls`** (`blocks/shared/controls/`) is the actual
Style/Decimals/Separator/Symbol/Position UI, shared between two very
different homes: rendered directly in `gateway/card-field-number`'s own
Inspector (a block's own sidebar has plenty of room), and inside a
`<Modal>` on `gateway/datatable`'s own per-column "Format" button (see
below) -- the same fix `facet-config-table.js`'s own "Default" modal
already applied for Compare/Value, needed again here for the same
reason: Style/Decimals/Separator/Symbol/Position is too much to add as
more inline columns in the already-narrow Inspector-sidebar config
table without forcing horizontal scroll.

**Format settings live on the block/column instance, never on
`Model_Fields`.** Whether a given Number field displays as "$4.55" or
"4.55%" is a presentation choice about THIS particular block/column,
not a fact about the field itself -- the same field could reasonably
show as Currency in one card template and Plain elsewhere. This mirrors
`gateway/card-field-text` never touching `Model_Fields` either (its own
`fieldKey` is a plain block attribute); nothing about this feature
added a new column to `gateway_fields` or a new REST route.

### `gateway/datatable`'s own per-column Number Format

The same Currency/Percent/decimal formatting reaches Data Table too --
via a "Format" button that appears only on a numeric column's own row
in the Columns config table (`column-config-table.js`), gated on
`Column_Registry::get_columns_for_collection()`'s own `isNumeric` (see
below), opening the exact same shared `NumberFormatControls` in a
`<Modal>`. A column's own chosen format is stored as a `format` key
alongside `key`/`sortable` in that block's `columns` attribute --
`undefined`/absent by default, so merely opening the modal without
changing anything never silently turns formatting on; it's only ever
written the moment a real control inside it changes.

Data Table's own `sourceType: 'collection'` branch (`gateway/datatable-body/render.php`)
is where this actually applies: a requested column's own `format` is
carried through from the block's stored `columns` attribute ONLY when
`Column_Registry` itself still reports that column `isNumeric` --
a stale format left over from a field since retyped away from Number/
Range is silently dropped, the same "never trust the editor's own
picker alone" discipline every other block's `render.php` in this
plugin already applies to its own attributes -- then
`Number_Formatter::format()` replaces the plain string cast every other
column (and every numeric column with no Format ever configured) still
gets. Deliberately Collection-only: the `sourceType: 'postType'`
branch's own post meta has no comparably reliable "this is really a
number" signal the way a Gateway model's own typed Number/Range field
does, so Number Format is never offered there at all.

### `gateway/card-field-image` -- a third field-display block, Return-Format-aware

The first real way to actually SHOW an Image field's own picture at all
-- `is_text_renderable()`/`is_numeric()` are both `false` for
`Image_Field_Type` (a bare attachment id, or a URL, or an enriched
object are all meaningless as plain text or a formatted number), so
neither `gateway/card-field-text` nor `gateway/card-field-number` ever
offers one in their own Field pickers. Structurally the same third twin
of that same family (same `ancestor`, same `usesContext`, same
"re-check against live availability, never trust the editor's own
picker" `render.php` discipline) -- its own Field picker is filtered to
**`isImage`**, which deliberately reuses the EXISTING
`Field_Type::supports_media_settings()` flag rather than introducing a
new one: that's already `true` for exactly one built-in type
(`Image_Field_Type`; `File_Field_Type` has its own, separate
`supports_file_settings()`), the same thing "is this an image field"
needs to mean.

**Detecting the Return Format is the whole point of this block.** An
Image field's raw stored value is always a bare WP attachment id in the
database (`Image_Field_Type::blueprint_method() => 'unsignedBigInteger()'`)
-- its own configured **Return Format** (`array`/`url`/`id`, the same
General-tab `<select>` `FieldEditor.jsx` already has, "like ACF") only
ever shapes what a REST *consumer* (the admin app's own record editing
UI, primarily) sees, never what's actually stored. `Column_Registry::
get_columns_for_collection()` now exposes that field-level setting
directly as `returnFormat` (alongside the new `isImage`, computed from
`$field['settings']['return_format'] ?? 'array'` -- the same default
`Model_Fields::sanitize_settings()` uses), and this block's own
`render.php` reads it to decide how to resolve the record's own raw
attachment id: **`Gateway\Image_Renderer`** (a new, pure static class,
the same "one shared class, not duplicated per-render.php logic" shape
`Number_Formatter` already has) is where that actually happens --

- **'array' and 'id'** are both backed by the exact same real attachment
  id under the hood regardless of which shape a REST consumer would see,
  so both resolve through a real `wp_get_attachment_image( $id, $size,
  false, $extra_attrs )` call -- real `srcset`/`sizes`/width/height/
  lazy-loading attributes, courtesy of WordPress core itself, for free.
- **'url'** is a flat string with no id to look a different size up from
  at all -- deliberately restricted to a plain, hand-built `<img
  src="..." alt="..." />` even though the real attachment id is
  technically still available at this point in `render.php` (the raw
  stored column, same as always) -- honoring the field's own configured
  contract uniformly, the "like ACF" convention the user's own request
  named directly: a field configured this way is meant to behave as
  "just a URL" everywhere it's used, this block included, not have one
  particular consumer quietly ignore that because it happens to have
  more to work with.

Either branch returns `''` for anything that isn't a real, still
-existing attachment (`null`/blank/non-numeric, or an id naming a since
-deleted attachment) -- `render.php` renders nothing at all in that
case, never a broken-image icon.

**Settings applicable to images, including sizes, presuming the Return
Format supports it.** This block's own `size` attribute (a `<select>`
of this site's own registered image sizes, `blocks/shared/
use-image-sizes.js` -- the block-editor-side counterpart to the admin
app's own `useImageSizes.js`, both hitting the same `GET /gateway/v1/
image-sizes` route) is only ever shown in the Inspector when the
selected field's own `returnFormat` is `'array'` or `'id'` -- exactly
the two formats `Image_Renderer` can resolve a size for at all. For a
`'url'`-format field, a plain `Notice` explains why there's no Size
control at all instead: that field always renders full-size, and
picking "Image Array" or "Image ID" on the field's own General tab is
what would make a Size choice meaningful here.

Format settings live on the block instance, never on `Model_Fields` --
same reasoning `gateway/card-field-number`'s own `numberFormat` already
has: which size to show is a presentation choice about THIS particular
block, not a fact about the field itself.

### Related Fields: a hasOne/belongsTo relationship's own fields, right on this model's columns

`gateway/datatable` and `gateway/card-field-text` (via `gateway/data-cards`)
aren't limited to showing a Collection's own fields -- if it `hasOne` or
`belongsTo` another model, that related record's own fields are just as
choosable, right alongside this model's own ones (e.g. a `Ticket`
`belongsTo` `Event`: showing the `Event`'s own "Venue Name" directly on
the Ticket's own row/card, no separate Event grid needed). Configured
per block instance -- there's no separate model-level "Related Fields"
concept to manage on the model's own detail screen, just more entries in
the same Columns panel / Field picker every block already has.

**`Column_Registry::get_related_columns_for_collection( $class_name )`**
is the new piece: for every one of `$class_name`'s own relationships
where the type is `hasOne` or `belongsTo` -- both already treated as "a
single related record" elsewhere in this codebase
(`Model_Relationships::TYPES`' own `plural` flag is `false` for exactly
these two) -- it walks that related model's own `Model_Fields::all()`
and turns each one into another column:

```php
[
	'key'                 => 'eventDetails.venue_name', // "{method_name}.{related field name}"
	'label'               => 'Event Details: Venue Name', // "{related model's plural title}: {field label}"
	'type'                => 'model_related_field',
	'isFilterable'        => false,
	'facetType'           => [],
	'isTextRenderable'    => true, // the related field's own is_text_renderable() -- always true today, see below.
	'isNumeric'           => false, // the related field's own is_numeric() -- true for a related Number/Range field, making it just as choosable in gateway/card-field-number's own Field picker and gateway/datatable's own Format modal as one of the model's own fields.
	'isImage'             => false, // the related field's own supports_media_settings() -- true for a related Image field, making it just as choosable in gateway/card-field-image's own Field picker.
	'returnFormat'        => 'array', // the related field's OWN configured Return Format, read independently of whatever the model's own Image field (if it has one) is configured as.
	'relationship_method' => 'eventDetails',
]
```

A `hasMany`/`belongsToMany` relationship contributes nothing here -- it
has no *single* related record to pull one column's worth of value from
(that's what Relate to Many's own `[{id,label}, ...]` shape, elsewhere in
this README, is for -- a fundamentally different display). **One level
deep only, by design**: a related field that's itself a Relate to One/
Many field is skipped rather than followed to its *own* related model --
multi-hop nesting is real, separate complexity this pass doesn't take
on. A related `Password` field is skipped outright
(`is_sensitive()`) -- never surfaced as another model's own "readable"
column. **Never filterable, for now** (`isFilterable` is always `false`):
`Facet_Query::apply_collection_facets()`/`apply_facets()` only ever
filter `$class_name`'s own table -- teaching either one to filter
*through* a relationship (a JOIN, or a `whereHas()`) is real, separate,
undone work, so a related field never appears in a Facets panel yet,
only as a plain display column/field.
`get_columns_for_collection()` appends these right after a model's own
fields, so every existing caller (the Columns panel, `card-field-text`'s
own field picker) sees them automatically, with zero changes of their
own beyond grouping them visually apart from a model's own fields
(`AvailableColumnsList`'s new "Related Fields" group for the Columns
panel's clickable list; `card-field-text`'s own flat `SelectControl`
puts them after a disabled `"── Related Fields ──"` heading option
instead, since `SelectControl` has no real optgroup support).

**`Column_Registry::resolve_collection_value( $record, $key )`** is the
other new piece -- what actually reads one of these values off a real
record, since a related field's dotted key (`"eventDetails.venue_name"`)
isn't a real property name a plain `$record->{$key}` could ever resolve.
A plain key still resolves exactly that way; a dotted one splits into
`$relationship_method` + `$related_field_name`, resolves the loaded
relation first, then that field on it -- returning `null` (never an
error) if the relationship isn't actually loaded/set at all (e.g. a
`belongsTo` whose FK is `NULL`). Both `gateway/datatable-body/render.php`'s
cell rendering and `gateway/card-field-text/render.php`'s own value now
go through this one definition of what a Collection column's key means,
rather than each hand-rolling `$record->{$key}` independently.

**Eager-loaded, not lazy-loaded -- an N+1 query per record would
otherwise be unavoidable.** Reading `$record->eventDetails` on a record
whose `eventDetails` relation was never eager-loaded triggers Eloquent's
own lazy-loading: one extra query, *per record*, the first time that
relation is touched -- exactly what a rendered table of 50 rows, or a
Data Cards grid, must never do just to show one related column. Both
call sites collect which relationship(s) are actually needed *before*
running the query, and `->with()` them up front (one extra query per
relationship, not per row, regardless of how many rows match):
`gateway/datatable-body/render.php` does this directly, from
`$columns`' own already-selected `relationship_method` values (no
column selected means no relation loaded, either); `Data_Cards_Renderer::
get_collection_page()` gained a new `$template_blocks` parameter for the
same purpose, since a Data Cards grid doesn't have a flat `$columns`
list to read from -- a new private `collect_related_field_relationships()`
walks the card template's own parsed blocks (recursively, since a
`gateway/card-field-text` block could sit inside a row/column layout,
not just directly under `gateway/data-cards-body`) for every one of
their `fieldKey` attributes, resolving each dotted one back to its
relationship via `get_related_columns_for_collection()`. Both of
`get_collection_page()`'s callers (`gateway/data-cards/render.php`'s own
first-page render, `Data_Cards_REST_Controller::get_collection_items()`'s
later-page fetches) already had the card template's own parsed blocks in
scope right where they call it, so this only ever needed one more
argument passed through, not a new place to compute it.

**A real bug, fixed: `gateway/card-field-text`'s own *editor* preview
always showed a Related Field's label, never its real value.** That
preview (`edit.js`) reads `record[fieldKey]` off a record fetched from
`GET /gateway/v1/models/<class>/records` (`Records_REST_Controller::
list_records()`) -- but that response never had a key literally named
`"eventDetails.venue_name"` at all before this was fixed, so
`Object.prototype.hasOwnProperty.call( record, fieldKey )` was always
`false` for a Related Field specifically, no matter what, silently
falling back to the field's own label (a deliberate "never render
outright empty" fallback for a genuinely stale/removed field, not
meant to be every related field's *permanent* state). Fixed in
`Records_REST_Controller::enrich_records()`, which now also flattens
every Related Field onto each record under its own exact dotted key
(`Column_Registry::resolve_collection_value( $record, $key )`),
right alongside its existing Relate to One/Many enrichment -- both
kinds of relationship this method touches are eager-loaded together in
one combined `Collection::load()` call. This only ever affects the
admin app's own `RecordForm`/`RecordsCrud`/editor-preview REST
responses -- the real front end (`gateway/card-field-text/render.php`)
was never affected by this specific bug, since it resolves a Related
Field's value directly off the actual Eloquent record injected into
block context, never through this REST response at all.

### `gateway/related-items` -- looping over a hasMany/belongsToMany relationship, with its own template

Related Fields (above) cover a *to-one* relationship -- one related
record's own field shown as a plain value. A *to-many* one (an `Event`'s
own `Tickets`) needs a genuinely different shape: not one more column,
but a repeated list, each item rendered from its own template -- so it
gets its own block, `gateway/related-items`, reusing Data Cards' own
"design one template, repeat it" mechanism (`useBlockPreview`/
`BlockContextProvider`, one active item at a time) rather than
inventing a second one.

**Placement and configuration are entirely per-block-instance** -- same
decision already made for Related Fields, for the same reason (no
separate model-level concept to manage; every setting lives on the
block itself, in its own Inspector). `ancestor: ["gateway/data-cards-body"]`
(matching `gateway/card-field-text`'s own scoping -- any depth, as long
as a card template is somewhere above it) and `usesContext: ["gateway/
data-cards/collection", "record"]` -- the parent record (e.g. the
`Event`) it loops relative to. Two real settings, in its own
`PanelBody`: **Relationship** (a `SelectControl` fed by a new
`useLoopableRelationships( collection )` hook -- `GET /gateway/v1/models/
<class>/relationships`, filtered client-side to `hasMany`/`belongsToMany`
only, the same reasoning `Column_Registry::get_related_columns_for_collection()`
already applies to Related Fields in the other direction: a `hasOne`/
`belongsTo` has at most one related record, nothing to loop over) and
**Limit** (a `RangeControl`, 0-50, `0` meaning every related record --
same convention as `gateway/data-cards`'s own Limit).

**Choosing a relationship also resolves and stores `relatedCollection`**
(the related model's own class name, from that same relationships
list) as a second attribute -- not re-derived at render time, since
`providesContext` needs an actual attribute to map from: `{"gateway/
data-cards/collection": "relatedCollection"}`. This is the one context
key this block overrides for its own descendants; `gateway/data-cards/
sourceType` is deliberately left unprovided, simply inheriting the
ambient value from the outer `gateway/data-cards` block (always
`'collection'` wherever `gateway/related-items` is meaningfully used at
all, since a relationship only exists between two Gateway models).

**`gateway/card-field-text` needed zero changes to work inside this
block's own template.** It already only ever reads `context.record`
and `context['gateway/data-cards/collection']` generically -- it has no
idea, and no need to know, whether the record it's showing a field of
is the outer Data Cards card's own record or one level deeper, into a
related-items loop. Its own field picker (fed by `relatedCollection`
via the context override above) lists the *related* model's own
fields -- including, automatically, one more hop of Related Fields, if
the related model itself has any `hasOne`/`belongsTo` relationships of
its own. A card-field-text bound to a stale field (the relationship or
its underlying field changed since) degrades exactly the same "no
longer exists" way it already does everywhere else.

**A starting template auto-seeds itself** the same way `gateway/data-cards-body`
seeds a fresh Collection card: the first `RELATED_FIELD_COUNT` (3) of
the *related* model's own available fields, as `gateway/card-field-text`
blocks, the moment a relationship is chosen (or changed to a different
one) -- computed fresh from whatever `relatedCollection` is currently,
via the same `useAvailableColumns()` hook every other field picker uses.

**The editor's own live preview** fetches a real, page-1-sized sample of
related records for whichever record is currently active in the
*parent* `gateway/data-cards-body` preview -- a new route,
`GET /gateway/v1/models/<class>/records/<id>/relationships/<method>`
(`Records_REST_Controller::get_related_records()`), rejecting a
relationship that isn't `hasMany`/`belongsToMany` (`gateway_relationship_not_loopable`,
400) the same way the front end silently refuses to render one at all.
Returns `{ records, total }` -- `records` enriched exactly like
`list_records()`'s own response (`enrich_records()`, reused as-is, so a
related Ticket's own Related Fields/Relate to One-Many values show up
correctly in the preview too), `total` the real relationship count
(via the relation's own `->count()`), independent of `per_page` --
matching every other paginated response shape in this plugin. Purely a
preview aid, same as every other Collection-aware block's own editor
fetch; the real front end never calls it at all.

**The real front end (`render.php`) resolves everything directly off
the actual Eloquent record already in block context** -- no REST round
trip, no eager-loading concern to worry about here the way Related
Fields' own flat-list eager-loading is: a nested per-card loop like
this one is inherently "for each outer record, fetch its own related
rows," one query per *parent* record (`$record->{$method}()->take(
$limit)->get()`, or `->get()` for no limit), the same accepted cost a
nested Query Loop block already carries in WordPress core. Re-validates
`relationshipMethod` the same defensive way `card-field-text` re
-validates its own `fieldKey` -- `Model_Relationships::find()` must
still resolve it, and it must still be `hasMany`/`belongsToMany` --
silently rendering nothing for a stale/invalid one rather than trusting
a saved attribute. An empty related list shows "No `<related model's
plural title>` found." (matching Data Cards' own empty-state wording);
a non-empty one is rendered via `Data_Cards_Renderer::
render_items_for_collection()` **reused as-is** -- the exact same
synthetic-wrapper-block/`render_block_context` mechanism that
repeats a card template per top-level record, called here with this
block's own inner blocks (`$block->parsed_block['innerBlocks']`, read
directly off itself, the same property a parent block already reads a
*child's* own inner blocks from elsewhere in this plugin) and the
related records fetched above -- the only change needed to that shared
method was a new, optional `$item_class` parameter (default unchanged)
so a nested related-items list gets its own `gateway-related-items__item`
class instead of the outer grid's `gateway-data-cards-grid__item`,
which a site's own custom CSS targeting that class shouldn't also
match.

### `gateway/data-display` -- a docs-style sidebar browser (Doc Groups -> Docs)

A different shape of relationship browsing than either of the above:
not a value on a card (Related Fields), not a repeated loop inside a
card (Related Items), but a whole standalone, top-level two-pane
widget -- every record of a Collection listed down the left as group
headings, its own `hasMany` children listed under each one, and
clicking a child loads *that one's own* detail template into a main
pane on the right. Modeled directly on a typical documentation site's
own layout, and built and tested against exactly that shape: **Doc
Groups** (parent) `hasMany` **Docs** (child), each Doc Group heading
expanding to its own Docs, clicking one showing that Doc's own content.

**Only `hasMany` is offered, never `belongsToMany`.** A `useLoopableRelationships()`
call (gained an optional `types` parameter for this -- `gateway/related-items`
still defaults to both "to many" types) passes `['hasMany']` alone: a
`belongsToMany` child has no single "owning" parent to sit under --
this block's whole sidebar shape is one parent, its own children
underneath -- so it isn't offered in the Relationship picker at all.

**No Source toggle, unlike `gateway/data-cards`/`gateway/datatable` --
this block only ever browses a Collection.** There's no post-type mode
for it to switch out of in the first place (relationships are a
Gateway-model-only concept), so its own Inspector is just two controls:
`CollectionControl` (the parent Collection) and a Relationship
`SelectControl` (fed by `useLoopableRelationships`, filtered as above)
-- choosing one also resolves and stores `relatedCollection` (the
child model's own class name), the same pattern `gateway/related-items`
already established. `providesContext` maps `gateway/data-cards/collection`
from `relatedCollection` and `gateway/data-cards/sourceType` from a
fixed, never-edited `sourceType` attribute (always `'collection'`) --
unlike `gateway/related-items`, which simply inherits `sourceType` from
its own ancestor `gateway/data-cards` block, `gateway/data-display` has
no such ancestor to inherit it from at all (it's the root of its own
tree), so it has to provide that context itself.

**`gateway/card-field-text` (and `gateway/related-items`, for a child's
own further nested relationships) work inside this block's own
template with zero changes** -- both gained `"gateway/data-display"` in
their own `ancestor` list, the only change either needed, since both
already only ever read `record`/`gateway/data-cards/collection` from
context generically. The detail template is designed exactly the same
way a Data Cards card or a Related Items loop's own template is.

**Ordered oldest-first, deliberately not newest-first.** Both parent
groups and their own children are queried `orderBy( 'id', 'asc' )` --
the opposite of Data Table/Data Cards' own newest-first default. This
is a stable navigational index, not an activity feed: newest-first
would reorder existing sidebar entries every time a new group or child
was added, which is exactly the wrong feel for a sidebar a visitor
expects to find the same entry in from one visit to the next.

**Everything is rendered server-side, up front -- there's no REST fetch
on click, and no pagination.** Every child's own detail markup (across
every group) is rendered into the page at once, `hidden` except the
first; a small, dependency-free `view.js` just toggles which
`.gateway-data-display__panel` is visible and which sidebar link
carries `.is-active` on click -- the same "PHP renders real state up
front, JS only ever toggles/interacts" philosophy this plugin already
follows for Data Cards' own pagination. A known, accepted trade-off for
this first version: a Collection with a very large number of groups/
children renders a correspondingly large page. Real pagination/lazy
-loading here is real, separate work this version doesn't take on.

**A real gap this surfaced, fixed: `Records_REST_Controller::enrich_records()`
now adds a `label` key to every record it returns** (`list_records()`,
`get_record()`, `create_record()`, `update_record()`,
`get_related_records()` -- every one of them, since they all funnel
through this one method), the same display value `record_option()`
already computes for a *related* record shown elsewhere, now on the
record's own top-level response too. This block's own editor preview
needed a human label for a sidebar heading/child link alongside the
full record (for the detail template's own live preview) -- and
critically, there was no way to compute one correctly client-side:
`useAvailableColumns()`'s own column shape has no per-field type
information (`Password`/`Text`/`Number`/...) to apply `resolve_display_field()`'s
"first genuinely free-text field" rule against at all, only a generic
`'model_field'` classification. Reusing the server's own already
-computed answer, once, centrally, was the only way to get this right
without re-deriving that rule a second time somewhere it couldn't
actually be applied correctly. Guarded against a real, if narrow,
naming collision: "label" isn't one of `Model_Fields::RESERVED_NAMES`,
so a site owner's own field genuinely named "label" is never
overwritten -- the synthetic key only fills in where `$record->toArray()`
doesn't already have one.

**The editor's own preview** fetches real parent groups (`GET /gateway/v1/models/<class>/records`,
capped the same "page-1-sized preview" way every other Collection
-aware block's own editor fetch already is) and, for each one shown, its
own real children (`GET /gateway/v1/models/<class>/records/<id>/relationships/<method>`,
`gateway/related-items`' own endpoint, reused as-is) -- building the
same nested group/child sidebar structure render.php itself builds,
so designing the child detail template happens against real data, the
same "real editor preview, not a placeholder" conviction every other
Collection-aware block in this plugin already holds. Clicking a
child in the editor's own sidebar preview swaps which child's context
feeds the one real, editable template -- the same `useBlockPreview`/
`BlockContextProvider`, one-active-item-at-a-time mechanism `gateway/data-cards-body`/
`gateway/related-items` already established, applied here across every
child of every group rather than one flat list.

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

`Str::studly()` treats a space, a hyphen, AND an underscore as
equivalent word breaks -- "Vehicle Makes", "Vehicle-Makes", and
"Vehicle_Makes" all studly-case to the identical `VehicleMakes`, so
nothing here actually needed a space to be rejected. The admin app's
own Title input (`ModelsList.jsx`, see "Models screens" below)
restricts what can be TYPED into it anyway -- letters/digits/underscores
only, spaces and hyphens silently stripped on every keystroke -- purely
so the input itself never shows something that only LOOKS like a
model's real name ("Vehicle Makes") while silently becoming something
else by the time it's saved; server-side, `create()`/`rename()` still
accept a space/hyphen from any OTHER caller of this same method
(a REST request built by hand, e.g.) exactly as they always have.

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

### Type -- Content Type vs. Data Model, chosen once and fixed forever

Create Model's very first field, **Type**, is a `<select>` with exactly
two options -- `Model_Builder::TYPE_CONTENT_TYPE`/`TYPE_DATA_MODEL` --
deciding what a brand new model starts with. It comes before Title
deliberately: it's the more consequential choice of the two (Title can
be changed later via rename(); Type never can, see below), so it's
asked first.

- **Data Model** -- blank except for `id`/`timestamps`, the original,
  only-ever-available shape every model had before Type existed as a
  choice at all. The right pick for a lookup/join table, a settings-like
  singleton, or anything with no natural "one visitor-facing page per
  record" shape.
- **Content Type** -- the same blank table, PLUS two real fields added
  immediately afterward via genuine `Model_Fields::add()` calls (real ADD
  COLUMN migrations, not something baked into `model_template()` itself):
  a `title` **Text** field, and a `permalink` **Permalink** field
  tracking it in Auto mode (`settings.source_field => 'title'`) -- the
  two things this plugin's own single-page permalink support (see
  "Permalink fields" above) needs before a record can have a real URL at
  all. Root and Template Page are deliberately left unset -- those are
  genuine per-site choices (which URL prefix, which template page) with
  no sensible default, configured afterward on the model's own
  Permalinks tab, unlike "does this kind of model want a title and a
  slug at all," which Type answers once, up front.

Stored the same way Plural Title is -- `gateway_model_types`, class name
=> `TYPE_*` value, via `Model_Builder::get_model_type()`/`set_model_type()`/
`forget_model_type()` -- with one key difference: **it's fixed forever
once a model is created, with no way to change it afterward at all.**
The admin app enforces this by construction, not just by convention:
Create Model's own `<select>` (`ModelsList.jsx`'s `MODEL_TYPES`) is the
ONLY place Type is ever chosen; the model detail screen shows it back as
a plain static label (`MODEL_TYPE_LABELS`), never a control of its own.
There's no real migration path either direction that wouldn't need a
judgment call this class has no way to make on a site owner's behalf:
Content Type -> Data Model would leave its seeded `title`/`permalink`
fields orphaned rather than destroy real data by removing them
outright, and Data Model -> Content Type has no way to infer which (if
any) of a model's own existing fields should suddenly become "the"
title. A model with no stored entry at all -- every model created
before this feature existed -- resolves to `TYPE_DATA_MODEL`, the shape
it already had; nothing already on a site silently starts behaving like
a Content Type it never asked to be.

`rename()` carries the old class's Type through to the new one
unchanged (there's no parameter for it at all in that method's own
signature) -- a renamed Content Type is still a Content Type afterward,
with a *fresh* `title`/`permalink` pair on the new table, the same
"starts fresh on fields" trade-off every other field already has across
a rename (see below).

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
same shape as ACF's own field editor, deliberately. Seven built-in
types -- **Text**, **Number**, **Text Area**, **Range**, **Email**,
**URL**, **Password** -- each one's own `Field_Type` class (see
"Field_Type_Registry" below) says which Schema Blueprint column method
actually creates it. Text/Email/URL/Password all store identically
(`string`, i.e. VARCHAR -- they only differ in `<input>` rendering and,
for Password, `is_sensitive()`); Text Area gets its own uncapped `text()`
column, since a VARCHAR would truncate or reject multi-paragraph
content; Range stores like Number (`double()`) -- a slider's value is
still just a number underneath.

**Text Area renders as a `<textarea>`, not an `<input>`.** `input_type()`
returning `"textarea"` isn't a real HTML `<input type>` value at all --
`RecordForm` special-cases exactly that string to render a `<textarea>`
element instead. **Range** renders as `input[type=range]` with a small
live `<output>` alongside it (a bare slider with no visible number is
barely usable); its own configured Step (Presentation) and Minimum/
Maximum Value (Validation) settings pass straight through to the
`<input>`'s own `step`/`min`/`max` attributes -- see "Presentation field
settings" and "Range limits" below -- falling back to the browser's own
defaults (0-100, step 1) for whichever of those a field leaves
unconfigured.

**Password values are masked in the Records list view, not hashed in
storage.** `Password_Field_Type` stores plain text, same as Text -- it's
a generic field for an arbitrary attribute a record itself needs to
remember (e.g. a credential for an external service), not WordPress's
own user authentication, which already has its own separate hashed
storage. What actually sets it apart is `is_sensitive()`, a new
`Field_Type` method (`false` for every other built-in type) that
`RecordsCrud`'s own table reads (via `Field_Type_Registry::describe_all()`,
which now also exposes `is_sensitive`) to show `••••••••` in place of the
real value wherever it'd otherwise render a raw table cell -- the
record's own REST response still carries the real value (there's no
reason to hide it from an admin already allowed to edit it), only this
one *display* is masked, the same way a plain `input[type=password]` masks
typing without hiding the value from the person typing it.

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

**Storage: a real `gateway_fields` table, not an option.** Every field
is a row (`model`, `name`, `label`, `type`, `position`, unique on
`model`+`name`) in its own table -- created by `Model_Fields::ensure_table()`,
called once on plugin activation and defensively before every read/write
in that class too (covers a site upgrading from a version of this
plugin that predates the table, since WordPress never re-fires the
activation hook on its own; also handles a table that exists but
predates the `label`/`position` columns specifically, adding each via
`ALTER TABLE`). This table, not anything cached in memory or baked into
a model's own code, is the one source of truth: `Model_Fields::all(
$class_name )` always queries it fresh, ordered by `position` (`id` as a
tiebreak -- see "Fields are a sortable list" below) into the same flat
array of `{name, label, type, position}` field arrays a model's own
`getFillable()` needs -- deliberately never split into parallel
`{names: [...], types: [...]}` arrays; two fields simply sit as
neighbors in the same array.

**`getFillable()`, overridden -- not a `$fillable` property, and not a
live reference either.** Per the request that shaped this: rather than
declaring `protected $fillable = [...]` (which would need rewriting
every time a field changes), generated models override Eloquent's own
`getFillable()` method instead. The first version of `getFields()` this
override called through to simply read `Model_Fields::all( static::class )`
live -- but that means opening a model's own file shows a reference to
another class, not its actual fields. So `getFields()` instead gets its
fields **printed directly into the file as a literal array**, generated
fresh from the `gateway_fields` table every time `add()`/`update()`/
`remove()` changes something:

```php
public static function getFields() {
	return array(
		array( 'name' => 'subject', 'label' => 'Subject', 'type' => 'text', 'position' => 0 ),
		array( 'name' => 'priority', 'label' => 'Priority', 'type' => 'number', 'position' => 1 ),
	);
}

public function getFillable() {
	return array_column( static::getFields(), 'name' );
}
```

`Model_Builder::rewrite_model_file( $class_name, $table_name, $fields )`
does the printing (`fields_literal()`, via `var_export()` per name/label/
type so a value containing a quote or backslash still produces valid PHP);
`Model_Fields::add()`/`update()`/`remove()` each call it with the
table's now-current field list right after writing that same list to
`gateway_fields`. The DB write happens *first*, deliberately: if the
file rewrite ever fails (a permissions problem, say), the field itself
is never lost -- `add()`/`update()` return successfully with a
`warnings` entry rather than an error, and the very next add/update/
remove on that model (or an explicit `Model_Fields::resync( $class_name )`
call, which does nothing but that same rewrite) reads the table fresh
and repairs the file. This also "heals" a model whose file predates
`getFields()`/`getFillable()` existing in `model_template()` at all
(their original motivating bug: an older model kept Eloquent's own
default `$fillable = []`/`$guarded = ['*']`, so mass-assigning literally
any attribute failed with `MassAssignmentException: Add [x] to fillable
property...`, no matter how many fields the Field Editor added to it) --
the next field change on it rewrites the file via the current template
unconditionally, the same "just regenerate it" trade-off `retable()`
already accepts for its own model-file rewrite (a hand-edited model file
is only safe from this while nothing about its fields changes).

One real PHP limitation applies to all of this: the already-loaded class
in the *same* request that triggered a rewrite can't pick up its own
freshly-rewritten file (PHP can't redeclare a class mid-request) --
`Model_Fields::all()` itself is unaffected (it always queries the table,
never the model class), but `getFields()`/`getFillable()` on an
already-loaded instance won't see a field added later in that same
request. Verified end to end across two separate process invocations,
matching how a real "add a field, then later add a record" sequence
actually happens as two separate requests.

**Field names are real column names**, so they go through the same
sanitize-to-a-safe-identifier treatment a Title does (lowercase,
non-alphanumeric runs collapsed to `_`) -- "First Name" becomes column
`first_name`. Three names are reserved (`id`, `created_at`,
`updated_at` -- every model's own base columns already) and rejected
outright; a name colliding with another field already on the same model
is rejected too.

**`label` is a display string, not a column -- editing it is never a
schema change.** Every field also has a friendly `label` (shown in place
of the raw name in `RecordForm`/`RecordsCrud`), stored in `gateway_fields`
right alongside `name`/`type` but with no column of its own to keep in
sync: `Model_Fields::update()` only runs a migration when `name` and/or
`type` actually change, so relabeling a field is a metadata-only write
(new label recorded, model file rewritten with it) with nothing to
migrate. Left blank when adding or editing a field, it defaults to a
title-cased version of the (sanitized) name (`Illuminate\Support\Str::
headline()` -- "first_name" becomes "First Name"); a row from before this
column existed gets the same default computed on read, in `all()`, so an
upgraded site never shows a blank label either.

**A real bug here, fixed**: `update()`'s own "did the label actually
change" check originally compared against `all()`'s already-defaulted
value -- so resaving a field whose real `label` was still `NULL` (a
legacy row, say), with the exact text the fallback happened to already
display, looked like "nothing changed" and the row's `NULL` was never
replaced; only typing something *different* from the fallback ever
triggered a save. Fixed by diffing against the raw stored value (a
direct query, not `all()`'s own display-only substitution) -- a
genuinely blank stored label is now always "changed" against whatever
concrete label is being saved, fallback text or not.

**Every field migration's class name is version-suffixed**
(`AddFirstNameToTicketsTableV7`, not just `AddFirstNameToTicketsTable`)
-- unlike a model's one-time "create table" migration, the *same* field
can legitimately be added, edited, and removed more than once over a
model's life, so the class name alone can't be assumed unique; appending
the (globally monotonic) version number guarantees it always is.

**A field is never carried over on model rename.** Renaming a model
already drops its old table (see "Renaming a model" above); the old
class's field *rows* aren't replayed onto the new one either --
`Model_Builder::rename()` calls `Model_Fields::forget( $old_class )` to
delete them from `gateway_fields` outright, for the same reason Plural
Title's cousin (the table itself) isn't preserved -- a rename starting
completely fresh, rather than a rename silently generating a whole
cascade of new field migrations on the new table on your behalf.

**Fields are a sortable list, via a `position` column -- also never a
schema change.** Every row also has a `position`; `all()` always queries
`ORDER BY position` (`id` as a tiebreak, so a table full of rows from
before this column existed -- which all default to `0` -- still sorts by
insertion order, exactly as before). A new field is appended (current
max `position` + 1); nothing else changes another field's `position`
except the new `Model_Fields::reorder( $class_name, $names )`, which
takes every one of a model's field names in the desired new order,
rejects anything that isn't an exact permutation of the model's current
fields (`gateway_field_order_mismatch`), and -- like a label-only edit --
writes straight to `gateway_fields` and rewrites the model file with no
migration at all. `position` rides along in the field shape everywhere
(`{name, label, type, position}`, including the literal array printed
into a model's own `getFields()`), but it's the *array's own element
order* that everything downstream (`getFillable()`, the Field Editor,
`RecordForm`/`RecordsCrud`) actually treats as meaningful.

`Model_Field_REST_Controller`: `GET`/`POST /gateway/v1/models/<class>/fields`,
`PUT`/`DELETE /gateway/v1/models/<class>/fields/<field_name>`,
`PUT /gateway/v1/models/<class>/fields-order` (body: `{ order: [...] }`) --
the URL segment on the second route is named `field_name`, not `name`,
specifically so it never collides with the request body's own `name`
(the field's *current* name, from the URL, versus the *new* name being
saved, from the body). `fields-order` is its own sibling route rather
than nested under `fields` (e.g. not `/fields/order`) -- nesting it
would put it in direct conflict with `/fields/<field_name>`, which would
just as happily match the literal string "order" as a field name.
`admin-app/src/components/FieldEditor.jsx` is the UI: an editable table
of existing fields, columns in Type/Label/Name order, seeded from the
model detail response's own `fields` array (`Model_REST_Controller::
describe_model()`) so the page doesn't need a second request just to
show them.

**Reordering is a dedicated grip, visible only on hover, and nothing
else drags.** Each row's own leading cell holds two `lucide-react` icons
side by side (a new dependency for this plain-React admin app, "just
these few imports, tree-shaken to the icons actually used" -- same
reasoning as `react-hook-form` below): a `GripVertical` handle, opacity
`0` until that row is hovered, and the ONLY element that's `draggable`/
starts a reorder (`fields-order` via native HTML5 drag-and-drop, no
library, disabled the whole time any row is open for editing) -- and a
`ChevronRight`/`ChevronDown`, always visible, purely indicating whether
that row is open, with no click handler of its own (the row's own click
handler, below, already covers the whole row).

**The row never disappears, and the whole row opens it -- no Edit
button, no Save/Cancel/Done.** Clicking a row opens its own edit panel
right underneath it (a second `<tr>`, not a replacement for the first);
the open row itself keeps showing its own Type/Label/Name, live-updating
as you type rather than freezing until a save round-trips. Clicking the
already-open row again closes it (flushing first, see below -- there's
no separate button for this any more); clicking a DIFFERENT row while
one is open switches to it -- closes/flushes whatever's open first,
then opens the one actually clicked, never two panels at once. This
used to just silently do nothing instead, on the theory that "one
editing surface at a time" meant ignoring a second click the way the
old per-row Edit/Delete buttons' own `disabled` attribute enforced it --
but with no `disabled` styling here to signal that, a click that did
nothing just read as broken (reported as "Edit/Duplicate clicks fail
when another field is open"), not as an intentional constraint.
Duplicate's own row-actions link never needed that guard at all -- it
only ever appends a new row at the very end of the list, which can't
shift any other row's own index out from under an open edit panel the
way deleting an earlier one could (Delete keeps its own guard for
exactly that reason). "+ Add Field" appends a draft row
(`{ name: '', label: '', type: 'text', choices: [] }`, no id yet)
straight into the table, open from the start, in the exact same panel --
there's no separate standalone "Add Field" form, and no POST-vs-PUT
distinction visible to the site owner either.

**A small wp-admin-style row-actions menu sits under the Label cell's own
title on row hover: "Edit | Duplicate | Delete"**, plain text links
(`.row-actions`, hidden until hover, the same convention wp-admin's own
post list table already uses) -- each stops the click from also
bubbling up to the row's own open/close handler. "Edit" toggles the same
open/closed state clicking the row itself does -- opens a closed row,
closes that same row back up (flushing first) if it's the one already
open. "Duplicate" POSTs a copy of the field's own current, already-saved
data (name suffixed `_copy`, label suffixed " (Copy)") through the exact
same `/fields` route "Add Field" uses -- a Relationship_Field_Type field
can't actually be duplicated this way yet (its real name is always
derived from `relationship_method`, identical to the original's own, so
the request collides on that name and the server's own error surfaces
instead of silently pretending to succeed). "Delete" is the same
DELETE call the old dedicated button made.

**Every row is a fixed, generous height (~60px) with its content
TOP-aligned, ACF's own row-editor convention** -- not the more usual "as
tall as the content needs, vertically centered" a plain data table would
use. This is deliberate, not a compromise: the Label cell's true content
is two lines (its own title, `.gateway-field-editor-row-title`, plus the
row-actions line right under it, `visibility: hidden` until hover but
still reserving its own line of height even then -- a `display: none`
element would take up no space at all until it appeared, growing the row
out from under the cursor the instant it showed up), while every other
cell (chevron, Name, Type) is one line. Two earlier fixes were tried and
found wanting before landing here: plain `vertical-align: middle` on
every cell centered each one's own FULL content box, so the two-line
Label cell centered its title noticeably lower than the single-line
chevron cell next to it; floating the row-actions menu out of flow
entirely (`position: absolute`) fixed that specific mismatch but read
wrong once the row was made taller anyway -- ACF's own menu sits in
normal flow, under the title, not as a floating overlay. Top-aligning
everything against a shared, fixed row height (driven by the Label
cell's own two lines of content plus consistent padding on every `<td>`)
solves both at once: every cell's own FIRST line -- the chevron, the
title, Name, Type -- lands at exactly the same y regardless of how many
lines follow underneath it in that particular cell, so they read as one
aligned row without the menu ever needing to leave normal flow.
`.gateway-field-editor-drag-col-inner`'s own explicit `height`, matched
to `.gateway-field-editor-row-title`'s own `line-height`, is what
actually centers the chevron against the title's own visual center (not
just its top edge) despite both being `vertical-align: top`.

**Every change autosaves -- there's nothing to manage.** The panel's own
form state is one `react-hook-form` instance (`useForm`), reset to a
field's current values (or a blank draft's) whenever a row opens. A
`watch()` subscription debounces every value change by 800ms and, once
the result differs from what's actually saved and is valid enough to
submit at all, fires the same POST/PUT this used to wait for an explicit
Save click to send -- so typing a Label, flipping Required, or
reordering a choice just takes effect shortly after you stop. Closing a
row (clicking it again) flushes any still-pending change immediately
first, so closing right after typing never drops it; a draft that never
reached a valid, saved state is removed from the list entirely instead.
Every autosave attempt -- the debounce timer, or a flush from closing --
chains through one promise (`saveChainRef`) rather than firing
independently, so two attempts arriving close together run strictly one
after another instead of racing (a real risk otherwise: closing right as
a debounced save is still in flight could see a stale "is this still a
new, unsaved draft?" flag and wrongly delete a row that was actually
about to be saved). This does mean a field's Name can go through several
real RENAME COLUMN migrations if someone pauses mid-word while typing it
-- an accepted trade-off for "changes just happen," not something
specially worked around for Name alone.

**Typing into a brand new field used to lose focus a few characters in
-- a real bug, reported directly ("the fields keep losing focus, even
as I type").** Root cause: each row's own `<tr>` was keyed by
`field.id ?? 'draft'` -- stable for an already-saved field (its `id`
never changes across an edit), but NOT for a brand new, still-unsaved
draft (`handleStartAdd()` appends one with no `id` at all). The moment
the very first autosave actually lands -- 800ms after typing stops,
long enough to type several characters first, which is exactly why the
symptom read as "a FEW characters, then focus is lost" rather than
immediately -- the server assigns it a real id, this row's own key
flips from the string `'draft'` to that real number, and React, seeing
a changed key, tears the old `<tr>` down (Label input mid-focus
included) and mounts a brand new one rather than reusing it. Fixed by
keying the row on `isEditingThisRow` instead whenever it's the one
currently open (`'editing-row'`/a fixed `'editing-panel'` for its own
edit-panel row) -- there's only ever one editing row at a time, so a
fixed sentinel is already a stable, collision-free key for it, and its
identity never needs to change across the save that assigns it a real
id. Every other (non-editing, already-saved) row still keys on its own
real `field.id`, exactly as before -- that's what keeps drag-reorder's
own DOM reuse working. Verified with a temporary Playwright harness
(the established convention for an admin-app UI bug like this one --
mounting `FieldEditor` directly against a mocked `fetch`): confirmed
the reverted code actually reproduces the bug (typing into a new
field's Label, waiting past the debounce, `document.activeElement` no
longer being that same input) before confirming the fix keeps it
focused through that same debounce window, for both a brand new field
getting its first real id AND continuing to edit that same field
afterward (a plain PUT autosave, which was never affected -- its `id`
was already stable throughout).

**A pending change survives navigating away, not just closing the row.**
Closing a row is one way a change still mid-debounce gets flushed instead
of dropped, but it's not the only way this component stops watching a
row: leaving the screen entirely (this component unmounting) while a
change is still waiting out its 800ms debounce is a second one, found by
actually exercising the autosave flow end to end in a real browser rather
than only against `Model_Fields` directly -- unmounting used to just
cancel the pending timer outright. The debounce `useEffect`'s own cleanup
now flushes whatever's still pending (tracked in a small
`pendingSaveValuesRef`) instead of only clearing the timer, so the last
few keystrokes before navigating elsewhere are never silently lost.

See "Choice field types" below for the panel's own General/Validation/
Presentation tabs, and "Conditional Logic" further down for the fourth.

### Relationships (`Model_Relationships`) -- real Eloquent relationship methods, printed the same way fields are

A model's detail screen has its own Fields/Relationships tabs (plain
`nav-tab`/`nav-tab-active` -- core wp-admin classes, no extra CSS needed
-- both `FieldEditor` and `RelationshipEditor` stay mounted the whole
time via the `hidden` attribute rather than being conditionally
rendered, so switching tabs never loses an edit in progress in the other
one). Relationships is a Relationship Editor: pick another model, pick a
relationship type, Add
-- structurally the same `gateway_relationships` table +
"DB row first, file second" design `Model_Fields` uses, applied to a
different kind of thing. `gateway_relationships` (`model`,
`related_model`, `type`, `method_name`, unique on `model`+`method_name`)
is the one source of truth, created/upgraded by
`Model_Relationships::ensure_table()` the same way as `gateway_fields`;
`Model_Relationships::all( $class_name )` always queries it fresh.

**A relationship's own *metadata* never depends on anything else, but
every one of Eloquent's four relationship types genuinely cannot
function at all without some real schema existing first** -- a column
somewhere, or (for `belongsToMany`) a whole third table. `add()` now
creates exactly that, automatically, the moment the relationship itself
is added, for every type:

- **`belongsTo`**: a real FK column (`Model_Relationships::
  belongs_to_foreign_key( $method_name )` -- `Str::snake( $method_name )
  . '_id'`, matching Eloquent's own `belongsTo()` default exactly) on
  the *owning* model's own table.
- **`hasOne`/`hasMany`**: the same kind of column, but on the *related*
  model's own table instead (`Str::snake( $class_name ) . '_id'`) --
  Eloquent's own default puts the FK on the "many"/"has" side's
  *target*, not the owning side, for these two.
- **`belongsToMany`**: a whole pivot table, since Eloquent genuinely
  cannot function without a third table for this one -- never a column
  on either side's own table (`ensure_pivot_table()`): both models'
  class names, snake_cased, sorted alphabetically, joined with `_` for
  the table name (`Make` + `Model` -> `make_model`, confirmed against
  `HasRelationships::joiningTable()`/`joiningTableSegment()`); each
  side's own snake_cased name + `_id` for its own pivot column. This is
  exactly what `$this->belongsToMany( \Model::class )` (no explicit
  table/key arguments -- `Model_Builder::relationship_method()` never
  adds any) resolves to on its own, so the generated relationship method
  doesn't need to know this table even exists.

Every one of these (`ensure_foreign_key_column()`/`ensure_pivot_table()`)
runs as a real, generated-and-run migration -- a file under
`wp-content/gateway/migrations`, registered with `Migration_Registry`,
executed via `Migration_Runner::run()`, the identical mechanism
`Model_Fields::add()`/`update()`/`remove()` already use for a column
change -- not a bare inline `Schema::table()`/`Schema::create()` call.
Idempotent either way: a second thing that would need the exact same
column/table (declaring the same `belongsToMany` a second time from the
opposite direction; a `hasMany` and its own inverse `belongsTo` sharing
the identical physical FK column, by Eloquent's own convention; a Relate
to One field later bound to a `belongsTo` relationship -- see
`Model_Fields`' own section below) reuses what's already there rather
than erroring or trying to create it twice. There's also no `update()`
at all (unlike `Model_Fields`): every part of a relationship, including
its method name, follows automatically from *which* related model and
*what* type were picked, so "editing" one is really just
removing it and adding a different one -- nothing to change in place.

**Two real bugs here, fixed.** First: an earlier version of this method
created the `belongsToMany` pivot table via a bare inline `Schema::create()`
call, and its own caller didn't check whether it had even succeeded
before recording the relationship -- together, a failure of any kind
left a relationship that looked fully configured pointing at a pivot
table that was never actually created (reported as a live `Base table
or view not found` error the first time the relationship was queried,
well after the fact). Second, and broader: an even earlier version
treated `belongsTo`/`hasOne`/`hasMany` as having no schema consequence
at all -- the *only* way to get a `belongsTo`'s own real FK column into
existence was a site owner separately remembering to add a matching
"Relate to One" field afterward (`Model_Fields`' own
`Relationship_Field_Type` handling, below), and `hasOne`/`hasMany` had
no mechanism to get their own FK column at all, ever. Using either kind
of relationship for anything -- eager-loading it (this feature's own
"Related Fields," `Column_Registry::get_related_columns_for_collection()`,
above) or simply calling the generated method -- before that manual
step happened (for `belongsTo`) or with no possible manual step at all
(for `hasOne`/`hasMany`) failed with a live, uncaught `Unknown column`
SQL error. `add()` now checks every one of these schema-creation calls'
own result and aborts (returning its `\WP_Error` instead of recording
the relationship) if the migration failed for any reason, and every
relationship type is immediately, fully functional the moment it's
added, with no separate step required at all -- "Relate to One"/"Relate
to Many" (`Model_Fields`' own section, below) are purely an optional
admin-UI layer on top of a relationship that already works without
them (autocomplete search-and-select), never required infrastructure
for it.

**`remove()` cleans up the FK column it created too -- but only where
it's actually safe to.** A third real bug, reported directly: removing
a `belongsTo`/`hasOne`/`hasMany` relationship left its own auto-created
FK column behind forever, with nothing to ever clean it up. `remove()`
now drops it (`drop_foreign_key_column_if_unused()`), via the same
generated-and-run migration mechanism as everything else here -- but
only after confirming nothing else still needs it first:

- A real field -- plain, or a Relate to One bound to some *other*
  relationship (one bound to the relationship actually being removed
  already blocks reaching this point at all, via the existing "remove
  the field first" guard) -- still named exactly that column.
- Any *other* still-recorded relationship, anywhere on the whole site,
  that would independently derive this exact same (table, column) pair
  -- the real scenario this guards against: `Event hasMany Ticket` and
  `Ticket belongsTo Event` are two entirely independent relationship
  rows that happen to share the identical physical FK column
  (`tickets.event_id`) by Eloquent's own convention (a `hasOne`/`hasMany`'s
  FK is named after the *owning* class; a `belongsTo` declared the
  *other* direction, with its own naturally-derived method name, lands
  on the exact same column purely by construction). Removing either one
  alone must never drop a column the other one still needs to function
  -- checked via a full scan of every relationship currently recorded
  (`gateway_relationships` is small -- one row per relationship an
  entire site has configured -- so this costs nothing that matters, and
  needs no separate reverse index kept in sync).

`belongsToMany`'s own pivot table is the one thing left deliberately
untouched by any of this, unchanged from before: a whole shared table,
not a single column another exact relationship could also derive, so
there's even less signal here to tell whether dropping it is actually
safe -- another `belongsToMany` (from the opposite direction, or a
future one) could still be relying on the exact same table, and
Eloquent's own naming convention doesn't distinguish direction. Like
every other side effect `remove()` triggers, a failed or skipped column
drop is never surfaced as an error -- the relationship's own removal
already succeeded regardless.

**Method names are never typed in -- always derived automatically,
by design.** Relating a model to another via `belongsTo` or `hasOne`
(a "to one" relationship) names the method after the related model
itself, camelCased and singular; `hasMany` or `belongsToMany` ("to
many") pluralizes it. Relating `Make` to `Model` via `belongsTo` always
becomes:

```php
public function model() {
	return $this->belongsTo( \Model::class );
}
```

-- exactly the motivating example this feature was built around. Two
relationships that would derive the *same* method name (most likely: a
second relationship to the same related model) are rejected outright
(`gateway_relationship_exists`) rather than silently overwriting one
another -- a method can't be declared twice in the same generated class.

**A relationship is a real, callable method, not an array entry.**
Unlike `fields_literal()` (one PHP array literal), `Model_Builder::
relationships_block()`/`relationship_method()` print one whole method per
relationship directly into the class body, each with its own docblock
(`@return \Illuminate\Database\Eloquent\Relations\{BelongsTo,HasOne,
HasMany,BelongsToMany}` -- every one of `Model_Relationships::TYPES`'
own keys already matches its real Illuminate class name, one `ucfirst()`
away, so no separate mapping is needed) right after `getFillable()`.
Since fields and relationships are both printed into the *same* file,
`Model_Builder::rewrite_model_file( $class_name, $table_name, $fields,
$relationships )` always takes both, regardless of which side triggered
the rewrite -- `Model_Fields` fetches `Model_Relationships::all()` (and
vice versa) so neither one's change ever regenerates the file without
the other's current data still in it.

**`belongsToMany` prints `->withTimestamps()` -- every other type
doesn't.** **A real bug here, fixed**: a `belongsToMany`'s pivot table
always has real `created_at`/`updated_at` columns (`ensure_pivot_table()`
creates them unconditionally, above), but Eloquent only ever actually
*populates* them on `attach()`/`sync()` if the relationship itself opts
in via `->withTimestamps()` -- without it, every pivot row silently got
`NULL` for both, real columns nothing ever wrote to. `relationship_method()`
now appends `->withTimestamps()` specifically for `belongsToMany`:

```php
public function tags() {
	return $this->belongsToMany( \Tag::class )->withTimestamps();
}
```

`hasOne`/`hasMany`/`belongsTo` need no such call -- each is a plain
column on a real model's own table, already covered by that model's
usual Eloquent timestamp handling on `create()`/`save()`, no pivot
involved. Since the model file is only rewritten when something about
its fields or relationships actually changes, a `belongsToMany`
relationship added before this fix won't pick it up on its own --
removing and re-adding it (safe: the pivot table itself is untouched,
`add()`'s own `hasTable()` check already makes recreating it a no-op)
regenerates the file with the fix, the same as any other model-file
repair in this plugin.

**The current model is never offered as its own related model.** The
Relationship Editor's own model picker only lists every *other*
registered model (reusing `GET /models`, filtered client-side); server-side,
`Model_Relationships::add()` rejects a related model equal to
`$class_name` too (`gateway_relationship_self`), rather than only
trusting that exclusion to have happened in the UI.

**A relationship is never carried over on model rename**, for the same
reason a field isn't -- `Model_Builder::rename()` calls
`Model_Relationships::forget( $old_class )` when retiring the old class.
One known limitation, not yet fixed: this only forgets the renamed
model's *own* relationships -- another model's relationship whose
`related_model` pointed at the old class name is left referencing a
class that no longer exists. A future version could cascade that
cleanup too.

Only four relationship types ship built in -- `hasOne`, `hasMany`,
`belongsTo`, `belongsToMany` -- each one just an entry in
`Model_Relationships::TYPES` (label + whether it pluralizes the derived
method name), not a full one-class-per-type `Registry` the way field
types are: a relationship type's only two variable behaviors (the
literal Eloquent method name and whether to pluralize) are already
exactly its own array key + a boolean, with nothing else per-type
worth its own class the way a field type's `blueprint_method()`/
`input_type()`/`cast()`/`is_sensitive()` are.

`Model_Relationship_REST_Controller`: `GET`/`POST /gateway/v1/models/<class>/relationships`,
`DELETE /gateway/v1/models/<class>/relationships/<method_name>`,
`GET /gateway/v1/relationship-types`. `admin-app/src/components/
RelationshipEditor.jsx` is the UI.

**A real bug, fixed: `relationships` is owned by `ModelDetail` (the
parent screen), not fetched independently by `RelationshipEditor` and
`FieldEditor` each on their own.** It used to be exactly that -- each
component fetched (or was seeded with) its own separate copy on mount.
Adding a relationship via `RelationshipEditor` updated only *its own*
copy; `FieldEditor`'s own "Relate to One"/"Relate to Many" relationship
picker (below) kept reading its now-stale one, so it kept reporting
"No Belongs To relationships yet" -- even immediately after adding
one, in the same session, with no page reload in between -- and had no
way to actually add the field at all. `ModelDetail` now owns one
`relationships` state, passed to `RelationshipEditor` as a controlled
`relationships`/`onRelationshipsChange` pair (its own `handleAdd()`/
`handleDelete()` call `onRelationshipsChange()` instead of a local
setter) and straight into `FieldEditor` as a plain `relationships`
prop -- one shared source of truth, updated the instant either
component changes it, closing the staleness window entirely rather
than narrowing it.

### `Relate to One` / `Relate to Many` -- fields bound to a relationship, not a free-typed name

Two more built-in field types, on top of the seven plain ones: **Relate
to One** and **Relate to Many**. Where every other field type stores an
arbitrary value a site owner types in, these two instead display and
let an admin *select* one of this model's own relationships' related
records -- "if the model has `belongsTo` or `belongsToMany`, we need a
field type that can display the relationship and enable selection of
related models" was the whole point. They're deliberately
**autocomplete**, not a plain `<select>` full of every row: a model
could have thousands of records, and rendering all of them as `<option>`
elements doesn't scale the way a search-as-you-type does.

**A new `Relationship_Field_Type` interface, not a new method on
`Field_Type` itself.** Rather than adding a `relationship_type()` method
to the base `Field_Type` interface (which every one of the seven
existing type classes would then have to implement, returning `null`),
`includes/interface-relationship-field-type.php` declares a small
interface *extending* `Field_Type` with exactly one extra method:

```php
interface Relationship_Field_Type extends Field_Type {
	public static function relationship_type(); // 'belongsTo' or 'belongsToMany'
}
```

`Relate_To_One_Field_Type`/`Relate_To_Many_Field_Type`
(`includes/class-relate-to-{one,many}-field-type.php`) are the only two
classes that implement it; everywhere that needs to tell one of these
two apart from a plain field checks `is_subclass_of( $type_class,
Relationship_Field_Type::class )` -- `Field_Type_Registry::describe_all()`
now includes a `relationship_type` key (`null` for every plain type,
`'belongsTo'`/`'belongsToMany'` for these two) so the admin app can make
that same distinction without hardcoding either type's own key.

**The field's name is never typed in -- it's derived from the chosen
relationship.** Picking one of these two types asks for a relationship
instead of a name (see the admin app section below); `Model_Fields::add()`
validates it (must be one of this model's own `Model_Relationships`,
and of the exact matching type -- a Relate to One can only bind to a
`belongsTo` relationship, a Relate to Many only to `belongsToMany`,
enforced server-side even though the UI's own picker already only
offers the matching kind) and derives the real field name itself
(`derive_relationship_field_name()`):

- **Relate to One** (`belongsTo`): `Str::snake( $method_name ) . '_id'`
  -- exactly the foreign-key column Eloquent's own `belongsTo()`
  convention expects with no explicit arguments, confirmed against
  `HasRelationships::belongsTo()` itself. A `make()` relationship
  becomes field `make_id`, a real `unsignedBigInteger` column.
- **Relate to Many** (`belongsToMany`): the relationship's own
  `method_name`, used only as this field's metadata identity -- there's
  no column to name at all (next paragraph).

**Relate to Many has no real column -- `blueprint_method()` returning
`''` is a new sentinel meaning exactly that.** A many-to-many
relationship's data lives in the pivot table `Model_Relationships::add()`
already creates for it (see "Relationships" above), never a column on
either side's own table. `Model_Fields::add()`/`update()`/`remove()` all
now check `'' !== $type_class::blueprint_method()` before generating or
running any migration at all -- for Relate to Many, that check is
`false`, so adding or removing one of these fields never touches the
schema, the same "pure metadata" territory a relationship itself already
occupies.

**Relate to One's own column is owned by the relationship, not the
field -- so `add()` usually skips its own migration, and `remove()`
never drops it at all.** Since `Model_Relationships::add()` now creates
a `belongsTo`'s real FK column itself the moment the relationship is
added (see "Relationships" above), by the time a Relate to One field
gets bound to that relationship the column has almost always already
been created -- both derive the exact same column name from the exact
same shared `Model_Relationships::belongs_to_foreign_key( $method_name )`,
so `add()` checks whether it already exists (`is_subclass_of( $type_class,
Relationship_Field_Type::class ) && hasColumn(...)`) and skips
generating/running its own ADD COLUMN migration entirely when it does --
attempting one anyway would just fail outright. `remove()`'s own
migration is skipped unconditionally for one of these two field types,
never just when the column happens to already be gone: dropping it
would silently break the relationship's own generated `belongsTo()`
method, which keeps needing that column to function regardless of
whether a Relate to One field is ever bound to it. Removing the field
only ever forgets its own metadata; `Model_Fields::remove()` itself
never drops this column under any circumstances -- only
`Model_Relationships::remove()` ever does (see "Relationships" above
for when it actually decides that's safe).

**Immutable once created -- matches how a relationship itself already
works.** Neither the name nor the type of one of these two fields can
ever be changed via `update()`; a new guard rejects the attempt
(`gateway_field_relationship_immutable`) whether the field already *was*
a relate field or `update()` is being asked to retype a plain field
*into* one (which `update()` has no `relationship_method` parameter to
do correctly anyway). This is the same "remove and add a new one
instead of editing in place" rule `RelationshipEditor` already applies
to relationships themselves -- a relate field's whole identity comes
from its relationship, so "editing" it isn't really a smaller operation
than replacing it. Label stays freely editable regardless, same as
every other field type (no schema, no identity, purely display).

**`Model_Fields::all()`'s own shape grows two columns**:
`relationship_method` (`null` for a plain field) and `related_model`
-- resolved fresh on every call by cross-referencing
`Model_Relationships::all( $class_name )`, never stored redundantly in
`gateway_fields` itself (a relationship's own `related_model` can't
change without removing and re-adding it, so resolving it fresh costs
nothing and rules out drift by construction). The `gateway_fields`
table itself gains a matching nullable `relationship_method` column,
added via the same upgrade-path `ALTER TABLE` pattern `label`/`position`
already use.

**Removing a relationship a field still depends on is blocked.**
`Model_Relationships::remove()` now checks every one of the model's own
fields first; if any field's `relationship_method` matches, it returns
`gateway_relationship_in_use` instead of deleting the row -- otherwise
the generated model file would end up with a relate field pointing at a
relationship method that no longer exists on it. Remove the dependent
field first (an ordinary `Model_Fields::remove()` call -- no special
case there, since a relate field's own removal has no such reverse
dependency to worry about), then the relationship.

**The admin app**: picking "Relate to One" or "Relate to Many" in
`FieldEditor`'s own inline edit panel (Add or Edit -- one shared panel,
see "Fields" above) swaps the free-text Name `<input>` for a
`<select>` of this model's own relationships (`GET .../relationships`,
filtered client-side to the picked type's own `relationship_type`) and
sends `relationship_method` instead of `name` in the request body; with
none of the matching type configured yet, the form shows a message
pointing at the Relationship Editor below instead of an empty dropdown.
Editing an existing relate field disables its Name and Type inputs
(only Label stays editable), matching the server-side immutability
guard rather than letting a doomed request round-trip to find out.

### `Field_Type_Registry` -- one class per field type, controlling its own attributes

Rather than a flat lookup array mapping type names to behavior (which is
exactly what an earlier version of `Model_Fields` had -- a
`BLUEPRINT_METHODS` constant), each field type is its own class
implementing a small `Field_Type` interface (`includes/interface-field-type.php`),
registered the same way a model or migration class is:

```php
interface Field_Type {
	public static function key();               // "text", "number", ...
	public static function label();              // "Text", "Number", ...
	public static function blueprint_method();   // "string", "double", ...
	public static function input_type();         // the HTML <input type>
	public static function cast( $value );       // e.g. "3" -> 3 for Number
	public static function is_sensitive();       // mask in RecordsCrud's table? (Password only)
	public static function is_filterable();      // ever a sensible facet/filter? (false for Password, Relate to One/Many, Checkbox)
	public static function is_text_renderable(); // can gateway/card-field-text ever print this? (false for Password, Relate to One/Many, Checkbox, True/False)
	public static function eloquent_cast();      // Eloquent's own $casts entry, e.g. "array"/"boolean" -- null for no cast needed
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

### Choice field types (Buttons/Select/Radio/Checkbox) and True/False

Five more built-in `Field_Type`s, alongside Text/Number/TextArea/Range/
Email/URL/Password/Relate to One/Relate to Many: **Buttons**, **Select**,
**Radio**, **Checkbox**, and **True/False**. The first four each let a
site owner define their own small, ordered set of options for the field
-- e.g. a "Status" field offering "Open"/"In Progress"/"Closed" -- picked
via a button-group, a native dropdown, a radio group, or (the one
multi-select case) a group of independently-toggled checkboxes,
respectively. True/False is simpler still: a plain on/off value, with no
configured options at all.

**`Choice_Field_Type extends Field_Type`** (`includes/interface-choice-field-type.php`)
is the contract Buttons/Select/Radio/Checkbox each implement on top of
the base `Field_Type` interface -- the same `is_subclass_of( $type_class,
Choice_Field_Type::class )` pattern `Relationship_Field_Type` already
established for Relate to One/Many, so every existing field type stays
untouched; only a type that actually needs a configured choice list
implements it. It adds exactly one thing:

```php
interface Choice_Field_Type extends Field_Type {
	public static function is_multiple(); // true only for Checkbox
}
```

True/False is **not** a `Choice_Field_Type` -- there's no options list to
configure at all, just a fixed on/off value, so it implements the plain
`Field_Type` contract directly, the same as Text/Number/etc.

**A field's own choices live in their own table, `gateway_field_choices`
(`Model_Field_Choices`, `includes/class-model-field-choices.php`), not a
JSON blob squeezed onto `gateway_fields` itself** -- one row per choice
(`field_id`, `value`, `label`, `position`), the same "a real column is
what actually makes a list orderable" reasoning `gateway_fields`' own
`position` column already established for the fields list itself. Each
choice is a `{value, label}` pair, not a bare string: `value` is the
real, technical identity `Choice_Field_Type::cast()` actually stores/
returns/compares (a record's own saved value is always one of a field's
own configured `value`s, never a `label`), while `label` is a purely
cosmetic override of how it's shown -- in the admin app's own Select/
Radio/Buttons/Checkbox controls and the Records list's own display of an
already-saved value -- falling back to `value` when left blank. The same
"technical identity vs. optional display override" relationship
`gateway_fields.name`/`label` already have elsewhere in this plugin, one
level down. `unique( field_id, value )` is keyed on `value` alone, never
`label` -- two choices sharing a label but storing different values are
perfectly meaningful, the same way two posts can share a title. Every
write replaces a field's *entire* choice list at once
(`Model_Field_Choices::set( $field_id, $choices )` -- delete then
re-insert in the given order) rather than editing one choice in place --
the Field Editor's own choices list is a single orderable list a site
owner edits as a whole and saves once (add a row, remove a row, drag/
button-reorder, then Save), not a set of independent per-choice API
calls. `for_fields( $field_ids )` batch-reads every choice for several
fields at once, grouped by `field_id`, so `Model_Fields::all()` costs one
extra query total per model, not one per Choice field on it.

**`Model_Fields::require_choices_for_field( $raw_choices )`** is the
validation gate, the direct counterpart to
`require_relationship_for_field()`: sanitizes and trims each raw
choice's own `value` AND `label` (a bare string is also tolerated per
item, shorthand for `{value: $string, label: $string}` -- what an older
admin-app build, from before this split existed, would have sent),
dropping a choice whose `value` ends up blank after trimming (a
half-typed row in the admin app's own list editor shouldn't itself be an
error) and defaulting a blank `label` to that same choice's own `value`,
then requires at least one survives and that no two share the same
`value` (never checked against `label`), returning a clear `WP_Error`
(`gateway_field_choices_required`/`gateway_field_choices_duplicate`)
otherwise. Required by `Model_Fields::add()`/`update()` whenever the
(possibly new) `type` resolves to a `Choice_Field_Type` -- ignored
otherwise, and any previously-recorded choices are forgotten
(`Model_Field_Choices::forget()`) the moment a field's type changes away
from one, so retyping it back into a choice type later starts from a
clean slate rather than resurrecting a stale list. Unlike a relate
field's relationship, a Choice field's own choices (and its name/type/
label) stay freely editable in place for the whole life of the field --
there's no "immutable once created" rule here; reordering, adding, or
removing a choice is a normal `update()` call, and (like a label-only
change) needs no migration at all, since nothing about the schema
depends on *which* choices exist, only on the field's own column type.
`Model_Fields::remove()`/`forget()` (the latter used when a model is
retired via `Model_Builder::rename()`) both clean up a field's own
choice rows too, via `Model_Field_Choices::forget()`/`forget_for_fields()`
-- no orphaned rows left behind.

`Model_Fields::all()` now returns an extra `id` key (the field's own
`gateway_fields.id`, needed to address its own choices table) alongside
a `choices` key -- `[]` for every non-Choice field, an ordered array of
`{value, label}` pairs for one that has some, e.g. `[{value: 'open',
label: 'Open'}, {value: 'in_progress', label: 'In Progress'}, {value:
'closed', label: 'Closed'}]` (`label` always non-empty, even for a
choice that never had one typed in -- see `require_choices_for_field()`'s
own fallback above). `POST`/`PUT .../fields` (`Model_Field_REST_Controller`)
accepts a matching `choices` array param, required exactly when
`require_choices_for_field()` requires it.

**Storage**: Buttons/Select/Radio all store one plain string --
`blueprint_method() => 'string'`, no different from a Text field's own
column. **Checkbox stores a JSON array in one `text` column** -- any
number of the field's own choices at once, `[]` if none. Reading/writing
a genuine PHP array through that one column is what `Field_Type::
eloquent_cast()` (new, alongside `is_filterable()`/`is_text_renderable()`)
is for: `Checkbox_Field_Type::eloquent_cast()` returns `'array'`, and
`Model_Builder::casts_literal()` prints a matching `'topics' => 'array'`
entry into the generated model's own `protected $casts = [...]` (a new
property `model_template()` always prints now, `array()` for a model with
no field that needs one) -- Eloquent's own cast machinery then handles
the JSON encode/decode transparently, so `$record->topics` is always a
real array, never a raw JSON string a caller would have to remember to
decode. `True_False_Field_Type::eloquent_cast()` returns `'boolean'` the
same way, for a real `boolean` column. Every other built-in type's
`eloquent_cast()` is `null` -- no cast needed, unchanged from before this
existed.

**Validation, not just casting**: `Checkbox_Field_Type::cast( $value )`
normalizes an incoming array (or a lone scalar, tolerated as a one-item
selection) into a de-duplicated, trimmed, blanks-dropped array of
strings -- never validated against the field's own *currently*-configured
choices (`cast()` is stateless, with no access to which field this value
is even for; a stale checked value from a since-removed choice is simply
carried over as-is, the same tradeoff `update()`/`remove()` already
accept elsewhere for name/type changes). `True_False_Field_Type::cast( $value
)` accepts a real bool (the normal case) or the common truthy/falsy
string spellings (`"1"`/`"0"`, `"true"`/`"false"`, `"yes"`/`"no"`,
`"on"`/`"off"`) rather than PHP's own loose `(bool)` cast, which would
make the literal string `"false"` cast to `true`.

**Not filterable, not text-renderable**: Checkbox declares both
`is_filterable()` and `is_text_renderable()` `false` -- there's no single
scalar to compare a facet against (the same reasoning `Relate_To_Many_Field_Type`
already gives), and `gateway/card-field-text` printing `(string)` an
array would emit a PHP warning and print the literal word "Array".
True/False declares `is_text_renderable()` `false` too, for a subtler
reason: `(string) true` is `"1"`, but `(string) false` is `""`, which
reads as "this field is unset" rather than "this is off" -- a dedicated
block that prints an actual "Yes"/"No" is real, separate, undone work.
Buttons/Select/Radio are ordinary single strings, so both stay `true`.

**The admin app**: `FieldEditor` (`admin-app/src/components/FieldEditor.jsx`)'s
own edit panel has four ALWAYS-present tabs -- "General", "Validation",
"Presentation", "Conditional Logic" -- the same four ACF's own
field-settings screen has (see "Presentation field settings" below for
Presentation, and "Conditional Logic" further down for that fourth
tab). Unlike the top-level Fields/Relationships tabs on a model's
detail screen (still plain `nav-tab`/`nav-tab-active`, core wp-admin's
own boxed tab look), these four render as flat, text-only tabs with a
thin bottom border under the whole strip and a blue underline under
whichever one is active (`.gateway-subtab`/`.gateway-subtab-active`,
this component's own small addition to `styles.css` -- wp-admin has no
built-in "underline tabs" style of its own to reach for instead). Every
`.regular-text`/`<select>` across the whole admin app (not just this
panel) gets the same small visual treatment on top of wp-admin's own
plain-square default: a `#d0d5dd` border, a `6px` border-radius, and a
`#399ccb` border (plus a matching 1px "glow" via `box-shadow`) on focus.
Every label in this panel's own form grid, and in `RecordForm`'s, is
`13px`/`500`-weight/`rgb(60, 67, 74)` -- consistent, smaller, and less
heavy than a bare `<label>`'s browser default, without touching a
label's own `.description` hint underneath it (already its own separate,
lighter rule; unaffected either way since a direct rule on a specific
element always wins over an inherited one from its parent).

**The active row's own left-edge accent and the panel's own `border-left`
line up into one continuous straight line, not two offset segments.**
The active row's own blue accent (`.gateway-field-editor-row-active`'s
`box-shadow: inset 3px 0 0 #2271b1`, on the summary `<tr>` itself) sits
flush with the table's real left edge, ignoring cell padding the way an
inset box-shadow on a row always does; the panel's own `border-left`
(above) is a real border on a `<div>` one level *inside* its own
`<td>`, which -- with `.widefat`'s own default cell padding still
in effect -- would otherwise start a few pixels further right than the
row's own accent above it, breaking what should read as one line into
two visibly offset ones. Fixed with one more class, `.gateway-field-editor-panel-cell`,
on that specific `<td>` (`colSpan={4}`, wrapping `renderEditPanel()`)
zeroing out its own padding, so the panel's own border-left starts at
the exact same x-position the row's own box-shadow already does.

**This fix regressed once, silently, when the Fields table rows were
later made taller/top-aligned (see below) -- a real CSS specificity
lesson, not just a one-off bug.** `.gateway-field-editor-table tbody td`
gained its own `padding` rule at that point (needed for the taller
rows), and `.gateway-field-editor-table tbody td` (two classes plus two
element selectors) is MORE specific than `.gateway-field-editor-panel-cell`
alone (two classes, no elements) -- so the later rule silently won
regardless of which one came first in the file, undoing the zero-padding
fix above and reintroducing the exact same visual break. Fixed by
bumping `.gateway-field-editor-panel-cell`'s own selector to
`.gateway-field-editor-table tbody td.gateway-field-editor-panel-cell`
(the same two classes plus two elements, PLUS a third class on the same
element), so it wins outright rather than depending on which rule
happens to come second.

**Panel content lines up with the row's own chevron above it, not flush
against the panel's own border.** `.gateway-field-editor-edit-panel`'s
own `padding-left` (`32px`) is set high enough on purpose that its
content (the sub-tabs, and every form field beneath them) starts at or
just past the chevron's own x-position in the row above -- a plain
`1.25em` (matching the panel's other three sides) left the panel's own
content sitting a few pixels to the *left* of that chevron instead, an
"outdent" that read as misaligned rather than nested underneath it.
`padding-bottom` is `64px`, deliberately far more than the other three
sides: a `<table>`'s own rows sit flush against each other with no
gap to lean on for spacing between fields, so real breathing room
before the next field's own row has to come from inside this row's own
last cell instead. Every `.gateway-field-editor-form-grid`'s own `gap`
(between Type/Name/Label/Default Value in General, and between whichever
inputs Presentation shows) is `32px` too, for the same "real, deliberate
space" reasoning -- up from a plain `1em` that read as visually tight
once the labels above each input got their own smaller, lighter styling
(see below).

Type/Name/Label live in General, **Type first** -- deliberately, not
Name/Label/Type: it's both the more natural order to fill the form out
in, and what the other fields' own type-dependent rendering (Name
becoming a relationship picker for a relate type; Default Value, below,
switching between a text and a number input) already assumes; a
`ChoicesEditor`
(`admin-app/src/components/ChoicesEditor.jsx`) appears inline underneath
them, in that same tab, only when the picked type's own `has_choices` (a
key on `Field_Type_Registry::describe_all()`'s own output, alongside a
Choice type's own `is_multiple`) is `true` -- two text inputs per choice
(Value, then Label -- the same order Name comes before Label at the
field level itself, the technical identity typed first, the optional
display override second), a "⠿" handle to drag-reorder it (the same
native HTML5 drag-and-drop convention `FieldEditor`'s own fields table
already uses, not a second different mechanism), "Remove" to delete one,
"Add Choice" to append a blank one. A tab's own heading grows a small
green dot whenever it currently holds real content (General: at least
one choice with a non-blank Value; Validation: Required switched on) --
based on the live, already-autosaved values, not a "changed this
session" diff, so it's still showing the next time this same field is
reopened for editing, not just while it's being actively typed into.
`RecordForm` (`admin-app/src/components/RecordForm.jsx`) reads a field's
own `choices` straight off the field object (already threaded through by
`Model_Fields::all()`/the fields REST route) to render the right control
per `input_type` -- `<select>` for "select", a radio group for "radio", a
row of toggle buttons for "buttons", a group of checkboxes for
"checkboxes" (form state and the submitted value both a plain string
array), and a single native checkbox for "boolean" (form state and the
submitted value both a real JS boolean). Each choice's own `label` is
used ONLY as the visible option/caption text in every one of those
controls; the value actually read into form state and submitted --
`choice.value` -- is what a record ends up storing, exactly what
`Choice_Field_Type::cast()` on the server expects. `RecordsCrud`'s own
list view resolves an already-saved value back to its matching choice's
current `label` for the same reason (a technical value like
"in_progress" is far less useful to see in a list than "In Progress"),
falling back to showing the raw value as-is if it no longer matches any
of the field's *current* choices (one since renamed or removed from the
list, but never retroactively scrubbed from already-saved records --
see `Checkbox_Field_Type::cast()`'s own docblock for why).

### Required fields

A new plain boolean column on `gateway_fields`, `required` -- applies
uniformly to every field type (unlike `choices`, which only means
something for a `Choice_Field_Type`), toggled via the "Validation" tab
in `FieldEditor`'s own edit panel (a small custom toggle-switch control,
`.gateway-toggle`, built from a real `<input type="checkbox">` so it
stays a genuine, accessible checkbox under the hood -- there's no
`@wordpress/components`-style toggle available to this plain-React admin
app to reach for instead). `Model_Fields::add()`/`update()` both take a
`$required` param (always sent, default `false`); `update()`'s own
"nothing changed, skip straight to returning the old field" no-op check
gained a matching `$required_changed` alongside `$name_changed`/
`$type_changed`/`$label_changed`/`$choices_changed`. Same upgrade path as
every other column here: `ensure_table()`'s fresh-CREATE block declares it
directly, an ALTER adds it (`default(false)`) for a table that predates
it.

**Enforcement, not just metadata**: `Model_Fields::validate_required_fields(
$class_name, $data, $is_create )` -- called by `Records_REST_Controller::
create_record()`/`update_record()` right after `sanitize_record_data()`
casts the request body, and (this ordering matters) BEFORE
`extract_relate_many_data()` strips a Relate to Many field's own value
back out of `$data` for its own separate `sync()` call -- a required
Relate to Many field's own selected ids still need to be visible to this
check when it runs. `$is_create` changes what a field the request simply
doesn't mention at all means: on `create_record()` every required field
must actually be present (a brand new record has no existing value to
fall back on); on `update_record()`'s own partial update, an absent key is
left alone -- only a required field explicitly present-but-empty in the
request is rejected. Either way, once a key IS present, "empty" depends on
the value's own PHP shape (not the field's declared type), so this needs
no per-`Field_Type` interface method of its own:

- An array (a Relate to Many field's own ids, or a Checkbox field's own
  selected choices): empty only if `[]` -- `[0]` is a real selection.
- A bool (True/False): "required" here specifically means "must be
  checked" (the familiar "must agree to terms" meaning of a required
  checkbox) -- `false` counts as empty, not just `null`.
- A string (Text/TextArea/Email/URL/Password, or a single-select Choice
  type's own value): empty if blank *after trimming* -- a field of a
  handful of spaces has no more real content than `''` does.
- Anything else (Number/Range, a Relate to One's own id, ...): empty only
  if `null` -- `0`/`0.0` are real, present values a required Number field
  must accept.

A rejected request gets a single `gateway_record_missing_required_fields`
`WP_Error` (400) naming every missing field by its own label, not just the
first one found, so a site owner fixing a create request that's missing
three required fields doesn't have to resubmit three times to discover
each one in turn.

`RecordForm` marks a required field's own label with a small red `*`
(purely a visual hint -- the actual enforcement is the REST validation
above, not anything client-side) whenever `field.required` is `true`.

A third top-level tab, alongside Models and Database: **Records**. Its
own list screen (`RecordsList`, route `/records`) is every model again,
this time with its row count, reusing `GET /gateway/v1/models` --
`Model_REST_Controller::describe_model()` already runs `$class::count()`
for each one (wrapped in a `try`/`catch`: an unreachable database or a
migration that never ran shows as "--" rather than breaking the whole
list). Clicking a model opens `RecordsCrud` (route `/records/:className`),
the actual CRUD screen: Add New, edit an existing row, delete one --
Add New and Edit both open in the same `Modal`.

**Both Add New and Edit open in a `Modal`
(`admin-app/src/components/Modal.jsx`), floating above the list rather
than growing inline as an extra `<tr>` under the row.** `FieldEditor`'s
own Fields table still uses the ACF-style "row becomes a form, right
underneath it" interaction, and that's the right call there -- a
field's own settings never grow large enough to be a problem. A model's
RECORDS can carry many more fields than that, and an inline form that
size pushed every row below the one being edited further down the page
as it grew, reflowing the whole table underneath a form the site owner
was still filling out. A modal doesn't have that problem: the list
stays exactly where it is underneath, whatever the form's own length,
and the modal's own body scrolls independently (`max-height: 90vh`) once
it's taller than the viewport rather than growing the page. Add New
never actually HAD this problem -- it's already anchored at a fixed
position above the table that never moved regardless of how long an
inline form got -- but it now uses the same `Modal` as Edit anyway
(`showAddForm`, mirroring `editingId`'s own "which record is open"
role, just with no record to key off of yet), a deliberate consistency
choice: the two most common actions on this screen reading the same
way -- same dialog, same "Add New "/"Edit " + model name title
convention -- outweighs Add New's own lack of an actual growing-table
problem to justify staying different. `Modal` is hand-rolled rather
than a library (`@wordpress/components`' own `Modal`, say): this app is
plain React + Vite, deliberately kept separate from the Gutenberg
blocks' own `@wordpress/scripts` build, so pulling in a Gutenberg-only
dependency for one small dialog would be an odd fit. It closes on three
equivalent gestures -- the × button, clicking the dimmed overlay outside
the panel, or Escape -- all wired to the same handler Cancel already
used, and carries no focus trap (an admin-only screen behind a login,
not a public-facing surface with the same accessibility stakes a
plugin's own front-end widgets would have). "Clicking the overlay" is
judged by where the gesture actually STARTS (`onMouseDown`, tracked in a
ref), not just where the browser's own `click` event ends up firing --
a plain `event.target === event.currentTarget` check on `onClick` alone
was a real bug, reported directly: dragging to select text inside a
field (or just dragging the mouse across an input while clicking) often
ends the drag out over the dimmed overlay, and a `click` fires wherever
the mouse button is released, making that drag indistinguishable from a
deliberate click on the overlay itself. Only a gesture that both
started AND ended on the overlay now closes the modal.

**Every column and every form input comes from the model's own fields**
-- there's no separate "which columns to show" configuration anywhere.
`RecordForm` (`admin-app/src/components/RecordForm.jsx`, shared between
"Add New" and the Edit modal) renders one `<input>` per field, choosing
its HTML `type` from `useFieldTypes()`'s `input_type` for that field's
own `type` -- a "Number" field genuinely gets `<input type="number">`,
not a guess made independently of what `Field_Type_Registry` already
knows.

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

### Presentation field settings (placeholder / prepend / append / instructions / step)

A field's "Presentation" tab (previously an empty placeholder, alongside
"Conditional Logic") is now real for every field type. **`instructions`**
-- a note shown under the control, ACF's own convention -- is universal: every
built-in type recognizes it, and it's always the FIRST Presentation
setting a type recognizes, regardless of what else it recognizes. On top
of that, **Text**, **Number**, **Email**, **URL**, and **Password** all
also recognize a placeholder, and Text/Number/Range/Email/Password
recognize a prepended and/or appended string shown flush against their
own input (e.g. a "$" prepend and a "USD" append on a price field). Two
deliberate exceptions: Range does NOT get a placeholder the way
Text/Number/Email/URL/Password do -- a placeholder is text shown inside
an empty `<input>` before a value is typed, which means nothing for
`<input type="range">` (it always has a value, the slider's current
position, never an empty state to hint at) -- and URL does NOT get
Prepend/Append the way Text/Number/Range/Email/Password do, since
flanking a URL with a "$"/"USD"-style addon reads as nonsense in a way
it doesn't for an email address, a password, or a price. Number and
Range instead share one setting of their own, **Step**, the HTML
`<input type="number">`/`<input type="range">` `step` attribute -- e.g.
`0.01` so a price field increments/decrements (and validates) by cents
rather than whole units, or `5` so a quantity field or a slider only
moves in fives. None of these touch what's actually stored in the
field's own column -- purely presentational.

**Why one generic JSON column, not one dedicated column per setting.**
`gateway_fields` gains a single new nullable `text` column, `settings`,
storing whatever a field's own type recognizes as a JSON object -- not
`placeholder`/`prepend`/`append`/`instructions` each getting their own
column. Different field types will eventually want different, unrelated
extra data of their own (a Number field's own min/max/step, a Date
field's own format, ...) with no shared shape at all; a dedicated column
per possible setting doesn't scale the way `gateway_fields`' other
columns do (`choices`/`required`, each meaning the same thing for every
field type that uses them at all), and would leave most of them `NULL`
for most fields. One JSON column, validated against a per-type
whitelist rather than trusted as-is, is the same trade `choices` living
in its own table (not a column) already made for a different reason --
here it's shape variance across types, there it was orderability.

**`Field_Type::presentation_fields()`** (new interface method, alongside
`eloquent_cast()`/`is_filterable()`/`is_text_renderable()`) is that
whitelist: it returns the subset of `['instructions', 'placeholder',
'step', 'prepend', 'append']` a given type actually recognizes, **in the
order its own Presentation tab should render them in** -- `instructions`
always first, for every type, since it's universal; every other built-in
type returns just `['instructions']` except `Text_Field_Type`
(`instructions` plus placeholder/prepend/append, no `step`),
`Number_Field_Type` (the same set plus its own `step`, returned right
after `placeholder` and before `prepend`, which is exactly where it
renders), `Range_Field_Type` (the same as Number's, minus `placeholder`
-- a slider always has a value, there's no empty state a placeholder
could hint at), `Email_Field_Type`/`Password_Field_Type` (both the same
as Text's exactly -- an email address or a masked password is
presentationally just another single-line string), and `URL_Field_Type`
(`instructions` plus `placeholder` ONLY, no `prepend`/`append` --
unlike an email address or a password, flanking a URL with a
"$"/"USD"-style addon reads as nonsense). `step` is recognized by no
other type -- it means nothing for a plain string. Adding a setting to
another type later
means adding its key to the fixed catalog and to that one static method,
not a schema migration or a new column.

**`Model_Fields::sanitize_settings( $type, $raw_settings )`** is the
actual trust boundary, called from both `add()` and `update()` (each
gaining a new, always-sent `$settings` param, default `[]`) exactly the
way `require_choices_for_field()` already gates `choices`: it looks up
`$type`'s own `presentation_fields()`, keeps only the raw settings whose
key appears in that list (silently dropping anything else the request
sent, e.g. a `step` submitted for a Select field, or an unrecognized key
entirely), runs each surviving value through `sanitize_text_field(
trim( ... ) )` (`step`, though its own admin-app input is a real
`<input type="number">`, is stored and sanitized as a string -- like
every other setting here -- since all `settings` ever needs to do with
it is round-trip it back into the HTML `step` attribute, which is itself
just a string), and drops a value entirely rather than storing `''` if
it's blank after trimming -- a field with no real settings stores `NULL`,
not `'{}'` or a JSON object full of empty strings. `update()`'s own
"nothing changed" no-op check gained a matching `$settings_changed`
alongside `$name_changed`/`$type_changed`/`$label_changed`/
`$choices_changed`/`$required_changed`, and (like `choices`) a field's
settings are silently dropped the moment its type changes away from one
that recognizes them -- retyping a Number field with a configured `step`
into a Select field discards it, the same as retyping away from a Choice
type discards its choices (retyping between Text and Number specifically
keeps whichever of the four shared keys were already set, since both
recognize them -- only `step` itself is Number-only).

Same upgrade path as every other column here: `ensure_table()`'s
fresh-CREATE block declares `settings` directly; an ALTER adds it for a
table that predates it. `Model_Fields::all()` decodes it back into a
plain PHP array (`[]` for a field with nothing stored, never `null`), and
`POST`/`PUT .../fields` (`Model_Field_REST_Controller`) accepts a
matching `settings` object param (default `{}`), threaded straight
through to `add()`/`update()`. `Field_Type_Registry::describe_all()`
exposes each type's own `presentation_fields()` list too, alongside
`has_choices`/`is_multiple`/`relationship_type` -- what tells
`FieldEditor`'s own Presentation tab which inputs to actually show for
the currently-picked type, without a per-type list living in JavaScript.

**The admin app.** `FieldEditor`'s Presentation tab renders one control
per key in the current type's own `presentation_fields()`, **in that
list's own order** (this is what actually places Number's own Step Size
between Placeholder and Prepend, not a hardcoded position in the JSX),
driven by a small local `PRESENTATION_FIELD_META` catalog (`{
placeholder: {...}, step: {...}, prepend: {...}, append: {...},
instructions: {...} }`) that just supplies each key's own label and
control kind -- a plain `<input type="text">` by default, `<textarea>`
for `instructions`, and `<input type="number" step="any">` for `step`
itself (so entering a fractional step like `0.01` isn't fought by the
browser's own default whole-number stepping on the input used to *set*
it -- unrelated to whatever value ends up in the *record* form's own
`step` attribute for site visitors). Every one of these registers with
React Hook Form as `settings.placeholder`/`settings.step`/etc.
(dot-notation nested paths `register()` already supports natively), so
they autosave exactly like Name/Label/Required already do, and the tab's
own heading grows the same small green dot as General/Validation
whenever any setting currently holds a non-blank value. A type that
recognizes no presentation settings at all would show a plain "This
field type has no presentation settings yet." instead of an empty tab --
dead code against every built-in type today, since `instructions` being
universal means `presentation_fields()` never actually returns `[]`
any more, but kept as the honest fallback for a future type that somehow
opted out of even that. Prepend and Append each carry a
small `.description` hint of their own underneath the input ("Appears
before the input."/"Appears after the input.") -- purely a local,
admin-app-only aid for the site owner configuring the field (their own
direction isn't otherwise obvious from the label alone), never sent to
the server or stored anywhere.

`RecordForm` reads `field.settings` **generically**, not gated on
`field.type === 'text'` specifically -- since the server-side whitelist
above already guarantees every other type's `settings` is `{}`, there's
nothing for a type-specific check here to protect against.
`settings.instructions`, when present, renders as a small
`.description`-styled note UNDER a field's own control (not between the
label and it -- ACF's own convention this mirrors, and where every other
per-field description already lives here: Default Value's "Appears when
creating a new record.", Character Limit's "Leave blank for no limit.",
etc.), for any field type at all. `settings.placeholder` only ever has anything
to show for the one plain `<input>` fallback branch at the very bottom
of `RecordForm`'s own type-conditional chain (textarea/range/relate/
select/radio/buttons/checkboxes/boolean each render their own dedicated
control, none of which recognizes `placeholder` as a Presentation
setting in the first place) -- it passes straight through to the
`<input>`'s own like-named attribute unconditionally. `settings.prepend`/
`append` are recognized by TWO branches, not just the fallback one: the
plain `<input>` fallback (Text) and the dedicated Range branch both wrap
their own control in a small inline group
(`.gateway-record-form-input-group`, each addon a
`.gateway-record-form-input-addon`) styled flush against the input's own
border when either is configured, matching the familiar prepended/
appended-text input pattern -- for Range, the group wraps the
`<input type="range">` AND its own live `<output>` reading together (a
"%" append reads naturally right after the number, not squeezed between
the slider and its own readout). `settings.step` is recognized by the
same two types as `prepend`/`append` (Number and Range), but through
different branches -- the plain `<input>` fallback for Number, the
dedicated Range branch for Range (alongside `settings.min_value`/
`max_value`, its own Validation-tab settings -- see "Range limits"
below) -- passing straight through to each one's own `step`/`min`/`max`
attributes so the slider's draggable range and increment actually match
what's configured. Setting `step` on a non-numeric `<input>` is a
harmless no-op in every browser regardless, so neither branch needs to
gate it on the field's own type beyond already being one of the two
types that recognize it.

**Every field is a plain `<p>`, given a flat 32px `margin-bottom`**
(`.gateway-record-form p`) -- the same figure `FieldEditor`'s own form
grid already settled on, for the same reason: left to wp-admin's own
default `<p>` margin (`1em`, ~16px), two consecutive fields read as
cramped once a field's own instructions/description line is in the mix
too. `margin-bottom` only, not split top-and-bottom, so the gap between
any two fields is a single predictable amount rather than depending on
adjoining block margins collapsing against each other. The very last
field's own trailing margin is zeroed out again (`p:last-of-type`) --
that selector actually lands on the Save/Cancel buttons' own `<p>` (the
true last one, after every field), tidying up the form's own bottom
edge rather than leaving 32px of dead space below the buttons.

**Prepend/Append addons read as ONE continuously-bordered control, not
three stacked boxes.** `.gateway-record-form-input-addon` shares the
input's own border-color (`#d0d5dd`) and border-radius (`6px`) as its
own BASE style -- previously a plain flat square in a visibly different
gray (`#8c8f94`), which is what a screenshot showing a Password field
with BOTH a Prepend and an Append configured (`PASS: [_____] WORD`)
surfaced: no corner anywhere in the group was ever rounded, since the
addon never had a `border-radius` at all, only the input did (and the
input, sandwiched between two addons, has its OWN radius zeroed out on
every side that touches one -- correctly, since it's never the group's
own outer edge in that configuration). `:first-child`/`:last-child`
selectors on both the addon and the input then strip radius/border from
whichever sides face INWARD (an addon's side touching the input, or the
input's side touching an addon), leaving a rounded corner only at the
group's own true left and right extremes -- whichever element actually
sits there for a given field (an addon when configured, the input
itself otherwise) -- the same "single pill, one border, correct corner
wherever the group actually ends" shape regardless of whether a field
has a Prepend, an Append, both, or neither.

### A real bug: settings silently never saving, for a genuinely empty field only

A field's own `settings` -- whatever the sections above describe --
could silently fail to save ANY of it (Default Value, Placeholder,
Instructions, all of it) the very first time it was ever configured,
while a field whose settings were already a real, non-empty object from
an earlier save kept working fine. Confirmed by a user directly
inspecting `wp_gateway_fields` and the outgoing PUT payload: the request
body showed `"settings": []` no matter what had actually been typed
into the Field Editor -- an empty JSON ARRAY, not the expected object.

**Root cause: PHP and JSON can't agree on what an empty object is.**
`wp_json_encode()` (like PHP's own `json_encode()`) has no way to tell
an empty PHP array meant to become a JSON object (`{}`) apart from one
meant to become a JSON array (`[]`) -- empty is empty, and PHP always
picks `[]`. A field with no `settings` configured yet decodes to
`array()` internally, which is exactly this ambiguous case:
`Model_Fields::all()` (and `add()`/`update()`'s own return values) sent
that straight into the REST response as `"settings": []`.

**Why that broke saving, not just reading.** `FieldEditor.jsx` seeds its
own `react-hook-form` state directly from `field.settings`
(`startEdit()`): `field.settings || {}`. Since `[]` is truthy in
JavaScript, that `||` never falls through to `{}` -- the form's own
`settings` value silently started life as a genuine JS ARRAY. Typing
into any setting (`register('settings.placeholder')`, etc.) still
"worked" in the sense that it set a named property on that array
without erroring -- a JS array is still a plain object underneath,
property assignment on one is perfectly legal -- but `JSON.stringify()`
on an array ONLY EVER serializes its own numeric-indexed elements,
silently dropping every other named property. The very next autosave's
own outgoing request body carried `"settings": []` again, indistinguishable
from the network tab from the setting having never been typed at all.

**The fix, at both ends.** `Model_Fields::all()`/`add()`/`update()`
themselves are deliberately left alone -- their own return values are
also read internally as plain PHP arrays elsewhere (`validate_character_limits()`'s
own `$field['settings']['character_limit']`, `validate_range_values()`'s
`['min_value']`/`['max_value']`), so casting `settings` to an object
there would break every one of those with a fatal "cannot use object as
array" the moment a field's settings happened to be empty. Instead, a
new `Model_Fields::for_rest_response( array $field )` casts just
`settings` to `(object)` -- applied ONLY at the actual REST response
boundary, in `Model_REST_Controller::describe_model()` (the whole
model's own field list) and `Model_Field_REST_Controller::list_fields()`/
`add_field()`/`update_field()` (every route that actually serializes a
field to JSON) -- so the browser never receives `[]` for `settings`
again, regardless of whether it's empty. `FieldEditor.jsx` also gained
its own defensive `normalizeSettings()` helper, used everywhere
`field.settings` seeds form state (`startEdit()`) or gets sent back out
(`buildBody()`) -- a second line of defense against the exact same
array-vs-object corruption resurfacing through any other path (a stale
cached response from before this fix deployed, e.g.), not a substitute
for the PHP fix.

### Default value

A Text, Number, Range, Email, or URL field can be given a default value
-- what a brand new record starts out with, not how the field is
displayed, which is why it lives in **General**, directly under Label,
rather than alongside instructions/placeholder/step/prepend/append in
Presentation. It's shown with its own small note underneath, "Appears
when creating a new record.", and only ever actually applies there:
editing an existing record always shows that record's own real (even if
blank) value, never silently replaced by the field's configured default.
For Range specifically, this is a starting position for the slider --
exactly the same idea as a Number field's own default, just for a
control that otherwise always starts at whatever a bare
`<input type="range">` defaults to (`0`, or its own `min` if higher).
Email/URL are presentationally just another single-line string, so a
default there is the same idea again -- e.g. pre-filling a "Reply to"
field with the site owner's own address, or a "Website" field with their
own domain. **Password is the deliberate exception** despite being
presentationally identical to Text/Email/URL otherwise (it gets
Placeholder/Prepend/Append same as they do) -- a default PASSWORD
pre-filling every new record raises the exact "is this actually secret
if it's the same guessable value on every unfilled record" question a
default value doesn't raise for an ordinary string, so
`Password_Field_Type::supports_default_value()` stays `false`.

**`Field_Type::supports_default_value()`** (new interface method) is a
second, separate whitelist alongside `presentation_fields()` -- `true`
for `Text_Field_Type`/`Number_Field_Type`/`Range_Field_Type`/
`Email_Field_Type`/`URL_Field_Type` today,
`false` for every other built-in type, including `Password_Field_Type`
(per above) -- a default makes little sense for a Choice type, whose own
choices list already offers a natural "pick one," or a Relate field,
where a default related record raises its own questions -- does it
still exist, is it still valid -- this doesn't attempt to answer. The
two methods are kept separate because they answer different questions
(which Presentation-tab inputs to show vs. whether a default value makes
sense for this type at all) and render in different tabs, but a default
value is stored no differently a *shape* of data than a placeholder is --
so `Model_Fields::sanitize_settings()` merges both into one combined
whitelist (`presentation_fields()`'s own list, plus `'default'` when
`supports_default_value()` is true) before filtering a field's raw
`settings`, and the same one `gateway_fields.settings` JSON column holds
`default` right alongside placeholder/step/prepend/append/instructions.
`Field_Type_Registry::describe_all()` exposes `supports_default_value`
per type, the same way it exposes `presentation_fields`.

**The admin app.** `FieldEditor`'s General tab shows the Default Value
input only when the currently-picked type's own `supports_default_value`
is true, registered as `settings.default` -- the same RHF field object
Presentation's own inputs live in, just a different key -- so it
autosaves exactly like everything else here, and switches between a
plain text input and a real `<input type="number" step="any">` right
along with the picked Type, same as every other type-dependent part of
this form. General's own tab-heading dot now reflects *either* a
non-blank Default Value *or* a non-blank Choices list (previously just
Choices) -- and, in the other direction, Presentation's own dot is
computed only from the keys `presentation_fields()` actually returns for
the current type, not every key `settings` happens to hold, so a
Default Value configured on a Text field never falsely lights up its
Presentation tab too.

`RecordForm` applies `field.settings.default` as a field's initial value
only when `initialValues` itself is entirely absent -- true "Add New,"
never an edit of an existing record, which always passes a real (even if
blank) `initialValues` object of its own.

### Character limit

A Text or Text Area field can be given a maximum character length --
shown under **Validation**, alongside Required, with its own small
"Leave blank for no limit." note underneath. Unlike Default Value and
every Presentation setting, this one is an actual constraint on what can
be saved, the same kind of thing Required already is -- not a display or
new-record-default concern -- which is why it lives in Validation rather
than General or Presentation, and why it's genuinely *enforced*, not just
recorded.

**`Field_Type::supports_character_limit()`** (new interface method) is a
third whitelist alongside `presentation_fields()`/`supports_default_value()`
-- `true` only for `Text_Field_Type`/`Text_Area_Field_Type` today, `false`
for every other built-in type (including `Number_Field_Type`/
`Range_Field_Type`: a "character limit" on a number is a category error
-- a numeric range is `supports_range_limits()`'s own concern, see
"Range limits" below, not this one). Stored the
same way as everything else `settings` holds -- one more key
(`'character_limit'`) in the same generic JSON column, merged in by
`Model_Fields::sanitize_settings()` alongside the other two methods' own
keys -- but with one extra check on top: a `character_limit` value is
meaningless as an arbitrary string the way a placeholder is, so anything
left after trimming that isn't a genuine positive whole number is dropped
too, the same as leaving it blank ("Leave blank for no limit" is the
blank case; a non-numeric or zero value is treated identically rather
than stored as something enforcement would have to guard against
separately).

**`Model_Fields::validate_character_limits( $class_name, $data )`** is
the actual enforcement -- the direct counterpart to
`validate_required_fields()`, called by `Records_REST_Controller::
create_record()`/`update_record()` right alongside it. It needs no
`$is_create` distinction the way the required check does: a field the
request doesn't mention has nothing to check a length against either
way, on a create or an update, so it's simply skipped, the same for both
call sites. Only a string value already present in the (sanitized,
already-cast) request data is ever checked, measured with `mb_strlen()`
when available (a multi-byte UTF-8 character is one character against
the limit, not two or three) and falling back to `strlen()` otherwise. A
rejected request gets a single `gateway_record_character_limit_exceeded`
`WP_Error` (400) naming every offending field by its own label and its
configured limit, not just the first one found -- same "don't make a
site owner fix one problem at a time" reasoning `validate_required_fields()`'s
own error already follows.

**The admin app.** `FieldEditor`'s Validation tab shows the Character
Limit input (`<input type="number" min="1" step="1">`, registered as
`settings.character_limit` -- the same RHF field object General's own
Default Value and Presentation's own settings all share, just a
different key) only when the currently-picked type's own
`supports_character_limit` is true, autosaving exactly like Required
already does. Validation's own tab-heading dot now reflects *either*
Required being on *or* a non-blank Character Limit (previously just
Required).

`RecordForm` passes `field.settings.character_limit` straight through to
the plain `<input>` fallback branch's and `<textarea>`'s own `maxLength`
attribute -- a client-side convenience only (stopping a visitor from
typing past the limit rather than letting them submit and then rejecting
it), never a substitute for the server-side enforcement above, which a
request built by hand and bypassing this form entirely would still have
to pass.

### Range limits (minimum / maximum value)

A Range field can be given a minimum and/or maximum numeric value --
shown under **Validation**, alongside Required, each with its own small
"Leave blank for no minimum/maximum." note underneath, independently
optional (a field can configure just a minimum, just a maximum, both, or
neither). Same reasoning as Character Limit: an actual constraint on
what can be saved, not a display concern, so it lives in Validation and
is genuinely *enforced*, not just recorded.

**`Field_Type::supports_range_limits()`** (new interface method) is a
fourth whitelist alongside `presentation_fields()`/
`supports_default_value()`/`supports_character_limit()` -- `true` only
for `Range_Field_Type` today, `false` for every other built-in type.
Stored the same way as everything else `settings` holds -- two more keys
(`'min_value'`/`'max_value'`) in the same generic JSON column, merged in
by `Model_Fields::sanitize_settings()` alongside the other three
methods' own keys -- with a different extra check than Character Limit's
own, since a range bound isn't restricted to positive whole numbers the
way a length is: anything left after trimming that isn't `is_numeric()`
is dropped (a negative minimum, or a fractional bound like `2.5`, is
perfectly legitimate for a Range field and stored as-is; only genuinely
non-numeric input is treated as if left blank).

**`Model_Fields::validate_range_values( $class_name, $data )`** is the
actual enforcement -- the direct counterpart to
`validate_character_limits()`, called by `Records_REST_Controller::
create_record()`/`update_record()` right alongside it, with the same
"a field the request doesn't mention has nothing to check, so it's
skipped" reasoning needing no `$is_create` distinction either. Only a
numeric value already present in the (sanitized, already-cast) request
data is ever checked, against whichever of `min_value`/`max_value` are
actually configured (independently -- a field with only a maximum
configured never rejects a low value it has no minimum opinion about). A
rejected request gets a single `gateway_record_value_out_of_range`
`WP_Error` (400) naming every offending field by its own label and a
message tailored to which bound(s) it actually has ("must be between X
and Y" when both are configured, "must be at least X" or "must be at
most Y" when only one is), not just the first one found -- same
"don't make a site owner fix one problem at a time" reasoning
`validate_required_fields()`'s own error already follows.

**The admin app.** `FieldEditor`'s Validation tab shows Minimum Value/
Maximum Value inputs (`<input type="number" step="any">`, registered as
`settings.min_value`/`settings.max_value` -- the same RHF field object
General's own Default Value and Presentation's own settings all share,
just two more keys) only when the currently-picked type's own
`supports_range_limits` is true, autosaving exactly like Character Limit
already does. Validation's own tab-heading dot now reflects Required
being on, and/or a non-blank Character Limit, and/or a non-blank Minimum
or Maximum Value (previously just the first two).

`RecordForm`'s Range branch passes `field.settings.min_value`/
`max_value` straight through to the `<input type="range">`'s own `min`/
`max` attributes (alongside `step`, already read from Presentation --
see "Presentation field settings" above) -- a client-side convenience
only, keeping the slider's own draggable range honest, never a
substitute for the server-side enforcement above.

### Conditional Logic -- showing/hiding a field based on another field's value

Any field (regardless of type -- unlike Presentation/Default Value/
Character Limit, there's no `Field_Type` method gating this) can be
given "Show this field if ..." rules under its own **Conditional
Logic** tab: OR'd groups of AND'd conditions, each `{field, operator,
value}`, `field` limited to this model's OTHER already-saved fields (a
field can never meaningfully condition on its own value) and `operator`
one of **Has any value**, **Has no value**, **Value is equal to**,
**Value is not equal to**, **Value contains**. A record's field only
actually appears in `RecordForm` when at least one group's rules are ALL
satisfied by that record's OTHER field values -- the same OR-of-ANDs
shape ACF's own Conditional Logic already uses.

**Its own column, not one more `settings` key.** Presentation settings/
Default Value/Character Limit all share one generic `gateway_fields.settings`
JSON column because they're each a flat set of strings. Conditional
Logic is a genuinely different *shape* -- a nested tree of OR'd groups of
AND'd rules -- so it gets its own nullable `gateway_fields.conditional_logic`
TEXT column instead (`{enabled: true, groups: [...]}`, or `NULL` for a
field with none configured), same upgrade-path pattern as every other
column here (`ensure_table()`'s fresh-CREATE block declares it directly;
an ALTER adds it for a table that predates it).

**`Model_Fields::sanitize_conditional_logic( $class_name, $exclude_field_name,
$raw )`** is the trust boundary, called by `add()`/`update()` (each
gaining a new, always-sent `$conditional_logic` param) the same way
`sanitize_settings()` already gates `settings`: `enabled` must be truthy
or the whole thing is `NULL`; each rule's own `field` must actually name
one of this model's OTHER current fields (`$exclude_field_name` -- this
field's own current name -- is never a valid target, so a field can't
condition on itself) and `operator` must be one of the five recognized
ones, or the rule is dropped; a group left with no surviving rules is
dropped too; if every group ends up dropped, the result is `NULL`, the
same "empty means nothing stored, not an object full of blanks"
convention `sanitize_settings()` already established. `update()`'s own
"nothing changed, skip straight to returning the old field" no-op check
gained a matching `$cl_changed`.

**Self-healing against a rename/removal elsewhere.** A rule surviving
`sanitize_conditional_logic()` today can still go stale later: if the
field it references is subsequently renamed or removed, this method
isn't re-run against every OTHER field's own already-stored conditional
logic to fix it up (that would mean rewriting a potentially unrelated
field's own row on every rename/removal). Instead, `Model_Fields::all()`
runs a new `prune_conditional_logic_rules()` against its own freshly
computed list of current field names every time it decodes a field's
`conditional_logic` column, dropping any rule that no longer points at a
real field -- so a dangling reference degrades to simply not being
evaluated (never blocking, never erroring) rather than ever pointing at
the wrong field.

**Actually enforced, not just recorded -- "as if the field doesn't exist
for this record."** A required or character-limited field that's
currently hidden is exempt from that validation entirely: `Model_Fields::
validate_required_fields()`/`validate_character_limits()` both gained a
new `is_field_visible_for_data( $conditional_logic, $effective_data )`
check, skipping a field outright the moment it evaluates to hidden --
required or too long or not, that field is treated as if this model
doesn't have it at all for this particular record. `$effective_data` is
deliberately a separate thing from `$data` (the actual value being
validated): on `create_record()` it's just `$data` itself (every field
is always present in a create request regardless); on `update_record()`
it's `$record->toArray()` merged with `$data`, so a rule referencing a
field this particular partial update never mentions still evaluates
against that field's real, already-stored value -- not "can't tell,
assume it's empty." A rule referencing a field that isn't a key in
`$effective_data` at all (the same dangling-reference case
`prune_conditional_logic_rules()` already guards against, belt-and-suspenders)
is skipped rather than treated as satisfied or failed, so it never
single-handedly blocks or forces its own group.

**The admin app.** `FieldEditor`'s Conditional Logic tab has its own
"Conditional Logic" toggle (`conditional_logic.enabled`, a separate RHF
field from `settings` -- this data doesn't belong in that flat object)
and, once switched on, a new `ConditionalLogicEditor`
(`admin-app/src/components/ConditionalLogicEditor.jsx`) for building the
rule tree -- mirrors `ChoicesEditor`'s own shape (a controlled `groups`
array + `onChange`, wired in via one `<Controller>`, not
`react-hook-form`'s own `useFieldArray`, which would need one nested
instance per group for a tree this shape). Switching the toggle on with
no rules configured yet seeds one blank rule immediately, so the builder
is never shown genuinely empty. Each rule row's Field `<select>` only
ever offers this model's OTHER already-saved fields (whichever row is
currently open is excluded by index, not name -- a still-unsaved draft
has no name yet to exclude by); the Value `<input>` only renders for the
three operators that actually read it (Has any/no value need none at
all). The last rule in a group shows a blue "and" button (adds another
AND'd rule to that same group); every earlier rule shows a small "×"
instead (removing a group's own last rule removes the whole group -- a
"group with zero rules" isn't a state worth representing). "or" appears
between groups; "Add rule group" appends a new OR'd one. Conditional
Logic's own tab-heading dot lights up once it's switched on AND at least
one rule actually has a field picked. Each group renders as its own
bordered, generously-padded card (`24px`, `16px` between its own rules)
with real margin above "Show this field if", below each card, and around
"or" -- a first pass had all of this packed tight against itself with no
breathing room at all, corrected once actually seen rendered rather than
just read as JSX.

**`RecordForm`'s own client-side evaluation** (`fieldIsVisible()`, using
the same five operators, the same OR-of-ANDs shape, and the same
"a rule referencing a field that no longer exists never blocks its own
group" reasoning as the server) decides live, on every render, whether
each field's own `<p>` even renders at all -- no server round-trip, a
field can appear or disappear the instant whichever OTHER field it
depends on changes. A rule referencing a relate field compares against
that OTHER record's own *label* (`{id, label}`/`[{id, label}, ...]` --
see `RecordForm`'s own docblock), never its numeric id, since a label is
the only thing meaningful to type a comparison value against in the
first place. A hidden field is genuinely absent from what gets
submitted, not just visually collapsed: `handleSubmit()` omits it from
the payload entirely, so its own already-stored value (if any) is left
untouched rather than this form's own blank/default local state for it
silently overwriting something real -- the client-side half of "as if
the field doesn't exist for this record," with the server-side half
(above) never trusting that every possible caller actually did this.

### Relate fields in the Records screen: search, selection, and enriched responses

A Relate to One/Relate to Many field's own value is never a plain
scalar in a Records response -- `create_record`/`update_record`/
`get_record`/`list_records` all pass their result through a new
`enrich_records()` first, which replaces that field's raw stored value
(a bare FK id, or nothing at all for Relate to Many) with `{id, label}`
(`null` if unset) or `[{id, label}, ...]` (`[]` if none selected) --
`label` is that related record's own display value, so `RecordsCrud`'s
table and `RecordForm`'s own pre-filled selection can render it
directly with no second request. `label` is resolved via a new private
`resolve_display_field()` -- the first field on the *related* model
whose own type is genuinely free text (`text`/`textarea`/`email`/`url`;
deliberately excludes Number/Range/Password and a relate field itself,
none of which is a meaningful "name" for a record) -- falling back to
`#<id>` for a model with no such field at all rather than blocking the
feature. Every relate field's relationship is eager-loaded via one
`Collection::load()` call up front (`Illuminate\Database\Eloquent\
Collection`, not the plain `collect()` helper -- the latter has no
`load()` method at all, since eager-loading is Eloquent-`Collection`
-specific), so this stays one extra query *per relate field*, not per
row, even for the paginated Records list.

**Writing a relate field's value.** Relate to One is an ordinary column
-- its submitted id flows through `sanitize_record_data()`/`cast()`
like any other field. Relate to Many has no column to write to at all,
so a new `Model_Fields::extract_relate_many_data()` pulls its submitted
array of ids *out* of the sanitized data (by reference) before
`create()`/`update()` ever runs, and `Records_REST_Controller::
sync_relate_many()` applies it afterward via the relationship's own
`sync()` -- not `attach()` -- once the record actually has an id to
attach to. `sync()` replaces the *entire* set of related records with
whatever was submitted, so removing a previously-selected one (this
feature's own explicit requirement) is just submitting the value
without it, the same as any other field; submitting `[]` clears every
related record.

**`GET /gateway/v1/models/<class>/records/search?q=&exclude=`** is the
new route powering the actual search-as-you-type: searches the
*related* model's own rows by its `resolve_display_field()` (a LIKE
match, with the visitor's own typed wildcards escaped so they're
matched literally), or by exact id if the model has no text-ish field
and the query is all digits, capped at 20 results, returning `{id,
label}` pairs -- never full record data. `exclude` is a comma-joined
list of ids to leave out of the results (query-string-friendly, since
this value travels as a GET param rather than a JSON body) -- what
keeps an already-selected Relate to Many option from reappearing while
its own search box is still open for picking more.

**`admin-app/src/components/RelateAutocomplete.jsx`** is the UI: a
debounced (300ms) search box calling the route above, a dropdown of
results to click, and a chip per selected record with its own "×"
remove button. `multiple` is the only thing distinguishing the two
field types here -- `false` (Relate to One) replaces the single
selection outright and hides the search box once something's picked;
`true` (Relate to Many) appends to the array and leaves the search box
open for further picks, passing every already-selected id as `exclude`
so it can't be picked twice. `RecordForm` renders this instead of a
plain `<input>` for either field type's own `input_type`
(`relate_one`/`relate_many` -- like `textarea`, not real HTML `<input>`
values, just `RecordForm`'s own signal to special-case them), holding
the enriched `{id, label}`/`[{id, label}, ...]` shape directly as its
form state and converting it back to just the id(s) on submit; `RecordsCrud`'s
table renders a relate field's own label(s) instead of the raw shape.

### Image fields (`Image_Field_Type`) -- an attachment id, the WordPress media modal, and ACF-style constraints

An Image field stores a single WordPress attachment post id in an
`unsignedBigInteger` column -- the same "store the FK, enrich it for
display" shape Relate to One already established, not a new pattern.
Picking/uploading happens through the real `wp.media()` modal (the exact
one a post editor's Featured Image button opens), not a custom upload
widget: `Admin_Page::enqueue_assets()` now calls `wp_enqueue_media()`
before its own script enqueue, which is all `window.wp.media` actually
needs to exist on the Gateway admin screen.

**General tab.** No Default Value -- `supports_default_value()` is
`false`; there's no sensible "default attachment" for a record that
doesn't exist yet. Instead, gated on a new `Field_Type::
supports_media_settings()` interface method (`true` only for
`Image_Field_Type`), one select: **Return Format** (`settings.return_format`,
one of `array`/`url`/`id` -- what shape this field's value takes in
every GET response, see "Enrichment" below). ACF's own Image field also
offers a Library setting (all attachments vs. only ones uploaded to the
current post) -- left out here rather than shipped as a setting with no
actual effect: Gateway's own records aren't WP posts, so there's no
literal "this post" for a library scope to narrow to the way ACF's field
(always attached to a real post edit screen) can.

**Validation tab**, matching ACF's own Image field layout: a Minimum/
Maximum grid, two columns, each with Width/Height/File Size rows laid
out as a prepend-label/`<input>`/append-unit group ("Width"/px,
"Height"/px, "File Size"/MB -- `settings.min_width`/`max_width`/
`min_height`/`max_height`/`min_size`/`max_size`, all independently
optional, unlike Range's own min/max these must be non-negative), plus a
free-text **Allowed File Types** input (`settings.allowed_types`, a
comma/space-separated extension list, e.g. `jpg,png`). All seven are
merged into `sanitize_settings()`'s output only when
`supports_media_settings()` is true, with the same "drop anything that
fails its own check rather than reject the whole request" shape
`min_value`/`max_value`/`character_limit` already have.

**`Model_Fields::validate_attachment_constraints( $class_name, $data, $effective_data )`**
(originally `validate_image_constraints()` -- renamed once File fields
started sharing it, see that section below) is the actual server-side
enforcement, called by `Records_REST_Controller::create_record()`/
`update_record()` right alongside `validate_range_values()`. Skipped
the same three ways every other Validation check already is: a field
hidden by Conditional Logic for this request, a field the request
doesn't mention, or a value that isn't a real (positive, numeric)
attachment id. For everything else, it resolves the file on disk
(`get_attached_file()`), decodes its real dimensions
(`wp_get_attachment_metadata()`) and size (`filesize()`), and checks
width/height in pixels, size in MB, and extension against
`allowed_types` -- a single `gateway_record_attachment_constraint_failed`
`WP_Error` (400) names every offending field, same "don't make a site
owner fix one problem at a time" shape as every other bulk validator
here. **`ImagePicker.jsx`'s own `validateAttachment()`** mirrors all
three checks client-side, against the picked attachment's own JS model
attributes -- an immediate rejection at pick time, never a substitute for
the server-side check above (a request built by hand skips it entirely,
same as Character Limit's own client hint).

**Presentation tab.** Recognizes one setting, **Preview Size**
(`settings.preview_size`, a `<select>` of this site's own registered
image sizes -- `GET /gateway/v1/image-sizes`, a new
`Media_REST_Controller` route wrapping `wp_get_registered_image_subsizes()`
plus a synthetic "Full Size" entry always offered first, the same way
ACF's own Image field does) -- which of this field's own available sizes
`ImagePicker`'s preview renders at. Its options come from a small new
`useImageSizes()` hook (mirrors `useFieldTypes()`/`useRelationshipTypes()`)
fetched at render time, not from `PRESENTATION_FIELD_META`'s own static
catalog the way every other Presentation setting's options do -- there's
no fixed list of image sizes to hardcode, since `add_image_size()` lets
a theme/plugin register arbitrary ones per site.

**Enrichment (`Records_REST_Controller::resolve_image_value()`).**
Every Image field's raw stored id is replaced in a Records response by
whichever shape its own `return_format` configures, mirroring Relate to
One's `{id, label}` enrichment: a bare integer for `'id'`; a plain URL
string for `'url'`; or, for `'array'` (the default, and ACF's own shape)
`{id, url, alt, width, height, sizes: {name: {url, width, height}, ...}}`,
`sizes` built from every one of this site's registered sizes (plus a
synthetic `full` entry) via `wp_get_attachment_image_src()` per size. An
id that no longer resolves to a real attachment (deleted from the media
library since) enriches to `null` rather than a stale/broken shape.

**`admin-app/src/components/ImagePicker.jsx`** is the Records-screen UI,
rendered by `RecordForm` for `input_type === 'image'`. Its own `value`
prop can arrive in any of the three `return_format` shapes above for an
existing record; a bare id or a bare URL string can't render a preview
directly, so the component fetches the same rich `'array'` shape once on
mount -- `GET /gateway/v1/media/<id>` for the id case (a preview-only
fetch; the field's own form state stays just the id), or `GET /gateway/v1/media-by-url?url=`
for the url case (`attachment_url_to_postid()` server-side) -- the
latter also calls `onChange()` with the id it resolves, a one-time,
invisible normalization so resubmitting an untouched record still sends
a valid id rather than the URL string `return_format: 'url'` reduced it
to (a URL alone has nothing to submit back). Freshly picking a NEW image
needs neither fetch: `wp.media()`'s own attachment model already carries
everything a preview needs. "Select Image"/"Change Image" and "Remove"
buttons round out the control; `settings.allowed_types` also narrows
`wp.media()`'s own `library.type` filter (mapped from extensions to the
MIME types the filter actually expects, e.g. `jpg` → `image/jpeg`) so
the modal itself steers a visitor toward an acceptable file, on top of
the pick-time and save-time checks above.

### File fields (`File_Field_Type`) -- Image's own close sibling, for anything that isn't a picture

A File field is Image's own near-identical sibling for an attachment
that isn't necessarily (or even usually) a raster image -- a PDF, a
spreadsheet, a .zip, anything `wp.media()` can accept an upload of.
Same underlying storage (a WP attachment post id), same three-way
`return_format` General-tab setting, same `min_size`/`max_size`/
`allowed_types` Validation-tab bundle -- minus everything that only
makes sense for an actual image: no width/height bounds, no Preview
Size (no registered-image-sizes concept for an arbitrary file), and no
MIME-based filtering of the media modal itself (see below).

**A second `supports_*()` flag, not a shared one.** `Field_Type::
supports_file_settings()` is `supports_media_settings()`'s own sibling
-- `true` only for `File_Field_Type` -- rather than the two types
sharing one flag with conditional sub-behavior, because the two
bundles genuinely differ: a generic file has no
`wp_get_attachment_metadata()` dimensions the way a raster image does,
and no sizes to preview. `Model_Fields::sanitize_settings()` merges in
File's own narrower bundle (`return_format`/`min_size`/`max_size`/
`allowed_types` -- no `min_width`/`max_width`/`min_height`/`max_height`
at all) the same way it already merges in Image's own, and the exact
same enum/numeric-non-negative validation branches apply to both,
keyed by setting name rather than by which flag included it.

**One validator serves both types.** `Model_Fields::
validate_image_constraints()` was renamed to `validate_attachment_constraints()`
and its own gate widened to `supports_media_settings() ||
supports_file_settings()` -- its width/height checks simply never
trigger for a File field, since `min_width`/`max_width`/`min_height`/
`max_height` never exist in a File field's own settings to begin with
(nothing to gate on a type check for). The same renaming applies to
its own error code (`gateway_record_attachment_constraint_failed`).

**Enrichment gets its own resolver, not a reused one.** Image's
`return_format: 'array'` produces `{id, url, alt, width, height,
sizes}` -- meaningless for a PDF. `Records_REST_Controller::
resolve_file_value()` is File's own sibling to `resolve_image_value()`,
producing `{id, url, filename, title, mime_type, filesize}` instead --
the handful of things actually useful about any file, not an image's
own dimensions. `enrich_file_fields()` mirrors `enrich_image_fields()`
exactly, and `enrich_records()` now computes both `$image_fields` and
`$file_fields` up front, applying both enrichments in each of its two
branches.

**`Media_REST_Controller`'s two id/url routes gained a `kind` param.**
`GET /gateway/v1/media/<id>` and `GET /gateway/v1/media-by-url` now
accept `?kind=image` (the default, keeping every existing caller
unchanged) or `?kind=file`, dispatching to `resolve_image_value()` or
`resolve_file_value()` respectively -- one small, shared dispatch point
rather than a second pair of near-duplicate routes. `GET /gateway/v1/image-sizes`
stays Image-only; File has no Preview Size setting to build a `<select>`
for.

**The admin app.** `FieldEditor`'s General tab shows the same Return
Format `<select>` for both types (same underlying `settings.return_format`
field, registered once) with different option labels -- "File Array"/
"File URL"/"File ID" instead of "Image Array"/"Image URL"/"Image ID" --
picked by which of the two `supports_*` flags is actually true. Its
Validation tab shows the same Minimum/Maximum grid styling as Image's
own, just with a single File Size row per column instead of three
(Width/Height/File Size) -- reusing `settings.min_size`/`max_size`, the
exact same keys Image's own bundle already has. Presentation stays at
just `instructions` -- `File_Field_Type::presentation_fields()` never
lists `preview_size`.

**`admin-app/src/components/FilePicker.jsx`** is `ImagePicker.jsx`'s
own sibling for the Records screen -- same three-value-shape handling,
same normalize-a-`'url'`-value-to-an-id-on-load behavior (see
`ImagePicker.jsx`'s own docblock for the full "why," identical here),
same `GET /gateway/v1/media/<id>`/`media-by-url` fetches with `?kind=file`
appended. Two real differences: **no MIME-based `library.type` filter**
on the media modal at all -- Image's own `EXTENSION_TO_MIME` map works
because there's a small, fixed set of raster formats to cover, but an
arbitrary file's own `allowed_types` (`.pdf`, `.docx`, `.zip`, ...) has
no comparably small, reliable extension-to-MIME table, so the modal
opens fully unrestricted and relies on the pick-time client check plus
server-side enforcement instead; and **the preview is a filename/title
link, not a thumbnail** -- there's nothing meaningful to render visually
for a .zip or a .docx, so it links straight to the file itself using
whichever of `filename`/`title`/the bare URL is available.

### WYSIWYG fields (`WYSIWYG_Field_Type`) -- the real classic editor, not a bundled rich-text library

A WYSIWYG field is `Text_Area_Field_Type`'s own rich sibling: same
underlying storage (a real `text()` column, no arbitrary length cap)
and same plain-string `cast()`, but edited through WordPress's own
classic editor -- `window.wp.editor.initialize()`, wrapping TinyMCE and
quicktags, the exact same API a post's own content field and ACF's own
WYSIWYG field both use -- rather than a bundled rich-text library of
this plugin's own. `Admin_Page::enqueue_assets()` gained a
`wp_enqueue_editor()` call (right alongside its existing
`wp_enqueue_media()`) to make `window.wp.editor` available on the
Gateway admin screen at all, same "load WP's own JS, don't reimplement
it" pattern that call already established for Image/File's own
`wp.media()` pickers.

**`is_text_renderable()` is `false`**, unlike Text_Area's own `true`:
the stored value is genuine HTML, and `Column_Registry`'s own "render
this field's value as plain text" concept (currently only consumed by
Data Table/Data Cards columns) assumes a value that's safe to print
as-is. Showing raw markup as literal escaped text there would be both
ugly and, more importantly, not what "renderable" is supposed to mean --
there's no "render as trusted HTML" story built for this type yet, and
leaving the flag `false` keeps that gap explicit rather than silently
picking a wrong answer. `is_filterable()` stays `true`, though -- a
"contains" search still means something against the raw markup, the
same way WordPress's own `post_content` search already works. No
Default Value, Character Limit, or any of the other Validation-tab
settings -- ACF's own WYSIWYG field does offer a default HTML value,
but General's own Default Value input here is a plain single-line
`<input>` (see `RecordForm.jsx`'s own docblock), never itself a rich
editor, which would make typing a meaningful HTML default awkward at
best; nothing asked for this yet.

**`admin-app/src/components/WysiwygEditor.jsx`** is the Records-screen
control, rendered for `input_type === 'wysiwyg'`. Deliberately
*uncontrolled* from React's own side, unlike every other field in this
form: TinyMCE owns the actual DOM/content once initialized (its own
iframe, toolbar, undo history, ...), so fighting it with a React
`value` prop on every keystroke is a well-known anti-pattern for
wrapping this kind of imperative editor -- the cursor would jump back
to the start of the content on every character typed. `value` is read
exactly once, to seed the underlying `<textarea>`'s own initial content
before `wp.editor.initialize()` reads it; every change after that flows
the other way, out to `onChange`, via two separate listeners covering
both tabs the classic editor has: TinyMCE's own `editor.on('change
input undo redo setcontent', ...)` for the "Visual" tab, and the
underlying `<textarea>`'s own native `input` event for the "Text" tab
(switching tabs just hides/shows the TinyMCE iframe over the same
textarea -- typing directly into it while "Text" is showing never fires
any TinyMCE event, since the editor itself is merely hidden, not
destroyed). A fresh, randomly-suffixed DOM id per mounted instance
(not just the field's own name) is what keeps two `wp.editor.initialize()`
calls for the same field from ever colliding on one shared id -- Add
New and Edit are both modals now, so only one is ever actually showing
at once in the current UI, but nothing here assumes that stays true
forever. `wp.editor.remove()` on unmount is what actually tears the TinyMCE
instance down; skipping it would leak one every time a field closes and
reopens (the Edit modal, most commonly). If `window.wp.editor` isn't
available at all (e.g. this admin app's own `npm run dev`, with no real
WordPress admin screen behind it), the component falls back to a plain
`<textarea>` rather than failing outright -- the same graceful
-degradation `ImagePicker.jsx`'s own "media library isn't available"
message already has for a missing `window.wp.media`.

`RecordsCrud`'s own list view strips HTML tags and truncates to 140
characters for a WYSIWYG field's own preview, rather than falling
through to the generic branch and showing literal, escaped `<p>` tags --
the same "don't just dump the raw value" polish Image's own thumbnail
and File's own filename link already have for their own list-view
columns.

### The Type picker: searchable, grouped by category like ACF's own

`FieldEditor`'s General tab used to pick a field's own type from a plain
`<select>` -- fine for a handful of options, unusable once the type
list grew past a dozen with no way to tell related ones apart. It's now
a small searchable popover (`admin-app/src/components/TypeSelect.jsx`):
a search box filtering by label, and the remaining options grouped
under the same six category headings ACF's own "Add Field" type picker
uses -- **Basic**, **Content**, **Choice**, **Relational**, **Advanced**,
**Layout** -- in that fixed order regardless of registration order. A
category with nothing currently registered in it (Gateway has nothing
in Advanced/Layout today -- no date/color/map pickers, no repeater/
group/tab constructs) simply never renders a heading, rather than
showing up empty.

**`Field_Type::category()`** (new interface method, one of the six
fixed strings above) is what assigns each type to a group -- purely
cosmetic metadata, unlike every other `Field_Type` method: nothing
server-side reads or enforces it, it only decides which heading
`TypeSelect` files a type under. Text/Number/Text Area/Range/Email/
URL/Password are `'Basic'`; Image/File are `'Content'`; Buttons/Select/
Radio/Checkbox/True-False are `'Choice'`; Relate to One/Relate to Many
are `'Relational'` -- the same grouping ACF itself uses for the
built-in types Gateway's own overlap with. `Field_Type_Registry::
describe_all()` exposes it as `category` alongside every other flag the
admin app already reads from there, so a future field type is filed
under whichever category its own class names, automatically.

**A real, subtle bug this surfaced and fixed**: wrapping `TypeSelect` in
a `<label>` -- the same pattern every other General-tab field already
uses (`<label><span>...</span><input/></label>`) -- broke it in a way
that only showed up once the control had more than one of its own
`<button>`s. Per the HTML label-forwarding behavior, a `<label>` with
several labelable descendants still only ever designates ONE of them
(the first in tree order) as its own "labeled control"; clicking
*any other* labelable descendant inside that label -- an option deep in
`TypeSelect`'s own open panel, say -- also fires a synthetic click on
that first one (here, the toggle button), immediately after the real
click's own handler already ran. The result: picking an option correctly
updated the field's type and closed the panel, and then, in the very
same event, the forwarded click on the toggle reopened it right back up
-- a plain `<select>`/`<input>` never hits this (it *is* the label's own
one control, so the browser's own "don't also forward when you clicked
the control itself" rule already covers it), only a custom widget
rendering multiple buttons of its own does. Fixed by giving the Type
field a plain `<div className="gateway-field-editor-form-field">`
instead of a `<label>` (a new CSS rule matches both selectors, so the
visual layout is unchanged) and an explicit `aria-label` on
`TypeSelect`'s own toggle button, since it no longer gets one for free
from an enclosing `<label>`.

Structurally mirrors `RelateAutocomplete.jsx`'s own search-and-select
pattern (a `containerRef` closing the panel on an outside click and
Escape) -- the search itself is a plain client-side filter over the
already-fully-loaded `fieldTypes` list, not a debounced server request,
since (unlike a Relate field's own potentially large related table)
every field type is already known up front.

### oEmbed fields (`OEmbed_Field_Type`) -- a plain URL, plus a live preview from WordPress's own oEmbed proxy

An oEmbed field stores exactly what was typed and nothing else -- a
single URL, cast as a plain string, with no `resolve_*_value()`/
`enrich_*_fields()` pair at all (unlike Image/File): there's no
attachment id to resolve, no `return_format` shape to pick between, the
saved value on a `create_record()`/`get_record()` round trip is
byte-for-byte what was submitted. `is_text_renderable()` is `true` for
exactly that reason -- unlike WYSIWYG's own `false`, a bare URL is
always safe to print as plain text. `is_filterable()` stays `true` too,
a "contains" search against the URL still means something. No Default
Value, unlike `URL_Field_Type`'s own -- ACF's own oEmbed field doesn't
offer one either, and there's no obviously useful meaning for "default
embed" the way a default string makes sense for a plain URL field.

**Embed Size (Width / Height, in px) lives on the General tab, not
Validation** -- the one place this type's own settings genuinely diverge
from Image/File's pattern. Image/File's own min/max width/height on
Validation are *constraints*, enforced against whatever gets picked, and
rejecting a pick that doesn't satisfy them. Embed Size is not a
constraint on anything: it's a *display* setting -- the size requested
from the oEmbed provider when rendering a preview -- with nothing to
enforce and nothing that could fail validation, so it belongs alongside
Default Value/Return Format among General's other per-value-shape
settings instead. A new `Field_Type::supports_embed_settings()` flag
(alongside the existing `supports_media_settings()`/
`supports_file_settings()`, `false` on every other type) gates it in
both `FieldEditor.jsx`'s own General tab and `Model_Fields::
sanitize_settings()`'s settings-bundle merge -- `embed_width`/
`embed_height` reuse the exact same numeric-non-negative validation
Image/File's own bounds already share, just merged in under a different
flag. Both are optional; a field with neither configured falls back to
640×390 (the same default ACF's own oEmbed field uses) wherever a
preview is actually requested.

**`admin-app/src/components/OEmbedPicker.jsx`** is the Records-screen
control, rendered for `input_type === 'oembed'`. Unlike ImagePicker/
FilePicker/WysiwygEditor, this is a genuinely *controlled* input --
`value` is always a plain string (or `null`), never an enriched object,
so there's no reduction needed anywhere else in `RecordForm.jsx`: a
plain `<input type="url">` fires `onChange` with the raw string on
every keystroke, the same as any other text-shaped field already does.
Alongside the input, a live embed preview is fetched (debounced 500ms --
longer than `RelateAutocomplete`'s own 300ms search debounce, since a
real fetch to an external provider is slower and more expensive than a
local database search) from **`GET /wp-json/oembed/1.0/proxy`** --
WordPress core's own oEmbed proxy route (namespace `oembed/1.0`, a
different REST namespace entirely from this plugin's own `gateway/v1`),
the exact same route the block editor's own Embed block and ACF's own
oEmbed field both use, rather than this plugin implementing its own
oEmbed discovery/caching. `Admin_Page::enqueue_assets()` localizes its
own full URL as `GatewayAdmin.oembedProxyUrl` (`api.js`'s new
`fetchOembedPreview()` reads it directly, bypassing `apiFetch()`, since
it isn't a `gateway/v1` request); the proxy is what actually makes
`dangerouslySetInnerHTML`-rendering its `.html` response safe -- it's
WordPress itself doing the discovery/fetch server-side, against its own
allow-list of providers, and returning already-sanitized markup, the
same trust boundary every other oEmbed consumer in WordPress already
relies on. The fetch is keyed off both the URL and the field's own
`embed_width`/`embed_height`, so changing either re-fetches and the
preview always reflects the field's current settings; a request-id ref
guards against a slow, now-stale request clobbering a newer one's
preview if the visitor keeps typing.

`RecordsCrud`'s own list view renders the stored URL as a clickable
link rather than falling through to the generic plain-text branch --
the same small polish File's own filename link and Image's own
thumbnail already have for their own list-view columns.

### User fields (`User_Field_Type`) -- a bare WP user id, resolved and searched by hand rather than through `Model_Relationships`

A User field picks one of this site's own registered WP users -- stored
as that user's own `wp_users.ID` (`unsignedBigInteger()`, the exact same
column shape `Relate_To_One_Field_Type`'s own foreign key and
`Image_Field_Type`'s own attachment id both use). It's filed under
`category() === 'Relational'` alongside Relate to One/Relate to Many
(matching ACF's own grouping for its "User" field), but it deliberately
does **not** implement `Relationship_Field_Type` -- that interface, and
`Model_Relationships` underneath it, exist specifically for a reference
to another GATEWAY model's own record; a WP user is a real WordPress
entity this plugin doesn't own the schema for, the exact same
relationship `Image_Field_Type`'s own attachment id already has to
`wp_posts`. There's no multi-select "Users" variant (ACF's own User
field offers one) -- picking a single user is what was asked for; the
same field storing several ids the way Relate to Many does is a
separate, unimplemented feature, not something this type's own shape
tries to anticipate.

**`supports_user_settings()`** (new `Field_Type` interface method, `true`
only for `User_Field_Type`) gates General's own Return Format setting --
the SAME `settings.return_format` key, and the exact same
`Model_Fields::sanitize_settings()` enum check, `supports_media_settings()`/
`supports_file_settings()` already share for Image/File, just offered
narrower: **User Array** or **User ID**, never a "User URL" (a WP user
has no single canonical URL the way an attachment does -- `get_author_posts_url()`
names an archive-of-posts-by, not "the URL of this user", and would be a
confusing thing to hand back under a generic `'url'` format). Nothing
server-side needed its own narrower enum to enforce this -- `FieldEditor.jsx`'s
own `<select>` simply never renders a "User URL" `<option>` for this
type, the same "validated broadly, offered narrowly" split already
established. No Validation-tab bundle at all -- a bare user id has no
width/height/file-size/allowed-extension to bound the way an attachment
does.

**`Records_REST_Controller::resolve_user_value( $user_id, $return_format )`**
is `resolve_image_value()`/`resolve_file_value()`'s own close sibling,
just simpler (only two shapes, never three): `'id'` returns the bare id,
anything else (including missing/invalid, same "falls back to the rich
shape" convention every other `return_format` already has) resolves via
`get_userdata()` into `{id, name, email, avatar_url}` (`display_name`/
`user_email`/`get_avatar_url()`) -- `null` if the id no longer names a
real user (deleted since, e.g.), the same "don't invent data for
something that isn't there" reasoning a since-deleted attachment's own
id already gets. `enrich_user_fields()` threads this through
`enrich_records()` exactly like `enrich_image_fields()`/`enrich_file_fields()`
already do.

**`User_REST_Controller`** (`includes/class-user-rest-controller.php`) is
a small, admin-only pair of routes purpose-built for `UserPicker.jsx`,
the same role `Media_REST_Controller` plays for Image/File and
`Records_REST_Controller::search_records()` plays for Relate to One/
Many:
- `GET /gateway/v1/users/search?q=&exclude=` -- searches this site's own
  users by login/email/**display name** (`get_users()`'s own default
  `search_columns` covers the first two but not the third -- widened
  explicitly, since a site owner overwhelmingly searches by the name
  they see in wp-admin's own Users list, not a login/nicename that may
  well differ from it), wrapped in `'*...*'` for a genuine "contains"
  match. Returns `{id, label}` pairs -- the same minimal shape
  `search_records()` already returns for a Relate field's own search.
  `exclude` keeps the currently-selected user out of its own results.
- `GET /gateway/v1/users/<id>` -- one user's own `{id, label}` shape,
  found by id -- what `UserPicker.jsx` calls when a field's own
  `return_format` is `'id'`: the record's own value is then a bare
  integer, with nothing else to build a chip from without this.

**`admin-app/src/components/UserPicker.jsx`** is the Records-screen
control, rendered for `input_type === 'user'` -- `RelateAutocomplete.jsx`'s
own close cousin (search-as-you-type, an outside-click-closes dropdown,
a removable chip once something's picked), simplified to single-select
only and pointed at `/users/search`/`/users/<id>` instead of a Gateway
model's own records endpoint. The one genuine difference from Image/
File's own pickers: **`RecordForm`'s `handleSubmit()` needs NO
special-casing for a User field at all**, unlike Image/File's own
object-to-id reduction at submit time. `UserPicker` itself normalizes
form state down to just the bare id, synchronously on mount, the instant
it receives the enriched `{id, name, email, avatar_url}` shape (calling
`onChange( value.id )` right away, the same "one-time, transparent
normalization the person editing the record never sees" `ImagePicker.jsx`'s
own `'url'`-shaped value already gets) -- something Image/File's own
`'url'` format can't do this simply, since resolving a URL back to a
real id needs an async round trip first, while a User field's enriched
object already carries its own id needing no resolution at all. By the
time any submit is possible, `values[field.name]` is already the same
plain id-or-`null` shape every other field's own form state has,
falling through `handleSubmit()`'s generic branch unchanged.

`RecordsCrud`'s own list view shows the enriched object's own `name`
(never a link -- unlike Image/File, there's no obvious "visit this" URL
for a person), or a named `User #<id>` placeholder for a bare id
(`return_format: 'id'`) rather than resolving it to a real name, the
same "no extra per-row fetch this list view has no reason to make"
reasoning Image's own bare-id branch already gives.

### Permalink fields (`Permalink_Field_Type`) -- one record, one URL, built toward single-page support

A Permalink field is a model's own URL slug -- the "ticket-one" in
`/tickets/ticket-one` -- stored as a plain string column, same as a Text
field's own. **A model can only ever have one** (a new
`Field_Type::max_one_per_model()` flag, `true` only for this type,
`false` rolled out to every other built-in one, the same "a type
declares this about itself" pattern `is_filterable()`/
`is_text_renderable()` already use) -- enforced by `Model_Fields::add()`/
`update()` rejecting a second one outright, which is also what makes
"which field is the permalink field for model Ticket" a trivial, single
-answer question: **`Model_Fields::permalink_field_for( $class_name )`**
scans a model's own fields for the (at most one) match and returns it,
or `null`. Every later consumer -- record save, the admin app, and
eventually routing/rendering -- calls this one method rather than
re-deriving the same filter.

**`supports_permalink_settings()`** (new `Field_Type` bundle flag, same
shape as `supports_media_settings()`/`supports_user_settings()`) gates
three General-tab settings, all living in the field's own
`gateway_fields.settings` JSON -- no new table, no new REST route:
- `source_field` -- the name of another field on the SAME model this
  one auto-slugifies from (e.g. tracking "title"). Optional -- left
  unset, a Permalink field is manual-only. Validated (`Model_Fields::
  validate_permalink_settings()`, called from `add()`/`update()` right
  after `sanitize_settings()`, before anything touches schema) against
  the model's OTHER fields, requiring the target's own type to be
  `is_text_renderable()` -- reusing that existing flag as the
  eligibility signal rather than inventing a new one; a Password or
  Relate to One/Many field (or another Permalink field) was never a
  sensible thing to slugify.
- `root` -- the URL path prefix every one of this model's own records
  will live under (e.g. `"tickets"`), run through `sanitize_title()`
  (not just `sanitize_text_field()`) and checked against every OTHER
  model's own Permalink field (`validate_permalink_settings()` again --
  a small full scan over `Model_Registry::all()`, the same "small
  enough that scanning costs nothing, no reverse index needed"
  reasoning `Model_Relationships::all_relationships_everywhere()`
  already accepts) so two models can never silently claim the same
  root.
- `template_page_id` -- reserved for the routing/rendering work this
  field type is the first half of (see this section's own closing
  paragraph) -- a positive whole number or dropped, the same treatment
  `character_limit` already gets.

**The trickiest part: remembering, per RECORD, whether that one
record's own slug is currently tracking `source_field` (Auto) or has
been deliberately typed by hand (Manual)** -- a real, sticky, per-record
toggle, not something inferred from whether the stored value merely
happens to still match what auto-slugifying would currently produce
(that would have a real, if narrow, false-positive: a manual value that
*coincidentally* matches the current auto-slug would silently start
tracking again the next time the source field changed). Solved with an
explicit companion boolean column, **`{field_name}__manual`**,
auto-managed by `Model_Fields` -- created alongside the field's own
column in `add()`, renamed alongside it in `update()` (folded into the
very same rename migration, not a second one), dropped the moment the
field is retyped away from Permalink or removed entirely
(`ensure_permalink_manual_column()`, structurally identical to
`Model_Relationships::ensure_foreign_key_column()`'s own idempotent,
migration-backed approach, just simpler: this column is never shared
with anything else the way a relationship's FK column can be, so there's
no "is it still needed elsewhere" check on the way out). Never exposed
as its own Field Editor row -- it's part of ONE field's own backing
storage, two real columns instead of one, the same relationship a
Relate to One field's own FK column already has to its own row. A
double-underscore suffix can never collide with a real, user-typed
field name: `Model_Fields::sanitize_name()` already collapses any RUN of
non-alphanumeric characters (a literal `__` included) down to a single
`_`, so no sanitized field name can ever contain two consecutive
underscores to begin with -- a structural guarantee, not a separate
check this needed to add.

**`Records_REST_Controller::resolve_permalink_value( $class_name, &$data, $raw_body, $record = null )`**
is where the actual slug gets computed, called by `create_record()`/
`update_record()` right after `Model_Fields::sanitize_record_data()`,
before any of the other `validate_*()` calls (so a freshly-computed slug
-- or a rejected collision -- is already settled by the time those look
at `$data`). Mode resolution: the request's own `{name}__manual` key
wins if present; otherwise an UPDATE preserves whatever mode the record
is already in (reading its own current `{name}__manual` column), and a
CREATE defaults to Auto. **Manual** mode takes whatever's submitted for
the field as the site owner's own literal intent -- `sanitize_title()`'d
for URL-safety only, never further rewritten -- and rejects a real
collision against another record outright (`WP_Error`, 409) rather than
silently mutating it. **Auto** mode slugifies the current `source_field`
value (from the request if touched, else the record's own existing
value on an update) and appends `-2`, `-3`, ... on collision, excluding
the record itself on an update (mirrors WordPress core's own
`wp_unique_post_slug()`) -- so re-saving with an unchanged title never
needlessly suffixes itself. No `source_field` configured, or nothing yet
to slugify from, behaves like Manual mode's own "nothing submitted"
case: the key is left out of `$data` entirely, never a fabricated empty
slug -- on create, `validate_required_fields()` reports the ordinary
"missing required field" if it's marked Required; on update, the
record's existing value is simply left alone.
**`Records_REST_Controller::set_permalink_manual_flag()`** records which
mode a just-saved record ended up in, called once the create/update
itself has actually succeeded -- via `setAttribute()` + `save()`,
deliberately bypassing mass assignment entirely, since `{name}__manual`
is Gateway-internal bookkeeping, never a real, user-fillable field. This
is what keeps the whole feature from needing any change to
`Model_Builder`'s generated model template (`$fillable`/`$casts`) at
all.

**Admin UI.** `FieldEditor.jsx`'s own General tab gains a sixth shape,
gated on `supports_permalink_settings`: a **Source Field** `<select>`
built from the model's OTHER fields, filtered client-side to
`is_text_renderable` -- the exact eligibility
`validate_permalink_settings()` enforces server-side, mirrored here so an
ineligible field is never even offered -- plus a plain note pointing at
a new, separate **Permalinks** tab (beside Relationships, on
`ModelDetail`) for Root and Template Page, which aren't per-field
settings at all: Root is validated for uniqueness across every OTHER
model, so it belongs with the rest of this model's own configuration,
not buried in one field's own settings panel. `PermalinkEditor.jsx` is
that tab -- finds the model's (at most one) permalink field client-side,
and a small form for Root and Template Page (a plain `<select>` built
from WordPress's own `GET /wp-json/wp/v2/pages`, `status=any`), a Save
button (not autosave -- a rejected cross-model Root collision is a real,
expected possibility that deserves a deliberate "try again" moment,
unlike a single field's own row), and a `/{root}/example-slug` preview
once both are set. Both PUT through the *same* existing
`PUT /gateway/v1/models/<class>/fields/<name>` endpoint `FieldEditor`
already uses -- no new REST route -- carrying the field's entire body
forward each time (that endpoint replaces `settings` wholesale, it
doesn't merge, so `source_field` has to ride along even though this tab
never touches it itself). The Type picker (`TypeSelect.jsx`) also greys
out "Permalink" once a model already has one on some OTHER field
(`disabledKeys`, built from `Field_Type::max_one_per_model()`) -- a
client-side nicety on top of the same rejection `Model_Fields::add()`/
`update()` already enforce server-side.

On `RecordForm`, a Permalink field renders as a `PermalinkControl` --
classic WordPress permalink-editing UX, but LIVE: while in Auto mode it
shows a real-time preview, client-side-slugified (a rough JS mirror of
`sanitize_title()` -- an approximation good enough for a live preview,
since the authoritative slug is always computed server-side on save,
same "client hint, server enforces" split Character Limit's own
`maxLength` already has) from the tracked `source_field`'s own CURRENT
form value -- typing "Galaxy" into Title updates the preview to "galaxy"
immediately, not just after a save. An "Edit" link switches to Manual and
reveals a real text input, seeded with whatever the live Auto preview
was just showing (never blank) so editing always starts from something
real; "Revert to automatic" switches back, at which point the preview
resumes tracking `source_field` live again (whatever was typed into the
Manual input is simply abandoned, not remembered). Its form state is a
plain string slug plus one synthetic companion key, `{name}__manual`,
seeded from the record's own real `{name}__manual` column (defaulting to
Auto/`false` for a brand new record); submitting sends both keys
together, since `resolve_permalink_value()` needs the flag to know
whether to take the submitted slug literally or ignore it and recompute
fresh from `source_field`.

**WordPress routing (`Permalink_Routes`).** One rewrite rule per fully
-configured model (both `root` and `template_page_id` set --
`routable_models()` is the single source of truth both `register_rules()`
and `resolve_record()` build off, so the two can never disagree about
what's actually routed): `^{root}/([^/]+)/?$ -> index.php?page_id=
{template_page_id}&gateway_model={class}&gateway_slug=$matches[1]`,
`'top'` priority. Resolving through a real WordPress Page this way means
WordPress's own normal template-loading/main-query machinery does the
heavy lifting -- this plugin only needs to resolve the record and feed
it into block context.

Flushing is a version-counter compare, not a periodic TTL: `Model_Fields`
calls `Permalink_Routes::bump_config_version()` (a plain option bump)
wherever a Permalink field's own config changes in a way that could
affect routing -- added, removed, retyped into/out of Permalink, or its
`root`/`template_page_id` settings edited (a pure rename, or any OTHER
settings-only edit like `source_field`, never bumps -- neither changes
what's routable). `register_rules()` (on `init`) compares that version
against the one it last actually flushed and only calls
`flush_rewrite_rules()` when they differ -- a stale rewrite rule means
genuinely broken URLs, not tolerably-stale status info, so this has to
flush exactly on change, never just eventually, mirroring
`Migration_Runner`'s own has_run()/latest_ran_version() versioning
rather than `Database_Connection`'s TTL cache.

`resolve_record()` (on `wp`, once the main query has already matched the
real `page_id`) looks the record up by the model's own CURRENT permalink
field and slug -- re-derived fresh from `Model_Fields::permalink_field_for()`
every time, never anything baked into the rewrite rule itself beyond the
class name and root/template_page_id, which is exactly why renaming the
field (routability-neutral, per the paragraph above) never needs a flush
to keep resolving correctly. Not found -- or the model/field named in the
URL doesn't actually exist or route at all -- forces a real 404
(`set_404()` + `status_header( 404 )` + `nocache_headers()`, the same
trio core's own `WP::handle_404()` applies) even though `page_id` already
matched a real page: that page is only ever a template, never itself the
thing being requested. `inject_record_context()` (on `render_block_context`,
priority 1, mirroring `Data_Cards_Renderer`'s own identically-shaped
filter) then sets `$context['record']` to whatever was resolved, for
every block rendered the rest of the request.

**`rename_edit_node()` fixes the admin bar's own misleading label.**
WordPress core's own `wp_admin_bar_edit_menu()` (`admin_bar_menu`,
priority 80) already adds an "Edit Page" node linking to the CURRENT
template Page's own edit screen -- the right destination (there's
nothing else to edit; the record itself lives in a plain DB table, not a
post), but a misleading label: a site owner looking at, say, one Ticket
record has no reason to think of what's on screen as "a Page" at all.
Hooked one priority later (81, so core's own node already exists to
retitle) and a no-op unless `resolve_record()` actually resolved a
record for THIS exact request (`$current_record`) -- an ordinary Page
elsewhere on the site keeps its own accurate "Edit Page" label
untouched, and there's nothing to do at all for a visitor who can't see
the admin bar in the first place (`$wp_admin_bar->get_node( 'edit' )` is
simply `null` for them). Retitles rather than removing and re-adding:
`WP_Admin_Bar::add_node()` called again with the same `id` merges in
only the keys given (here, just `title`), filling in everything else --
href, parent, group, meta -- from the node's own current values, so this
never has to know or reproduce the href core's own code already built.

**`suppress_template_page_title()` blanks out the template Page's own
title -- reported directly.** A template Page is typically named
something like "Portfolio Item Template" -- a perfectly clear label for
the site owner configuring Permalinks, but never meant for an actual
visitor looking at one real record, and exactly what a theme's own page
template would otherwise print verbatim (classic `the_title()` inside
the Loop, or a block theme's own `core/post-title` -- both read through
the same `the_title` filter, `get_the_title()`'s own filter under the
hood). Hooked there rather than anything document-title-specific:
`wp_get_document_title()` itself builds a singular page's title part via
`single_post_title()`, which calls `get_the_title()` -- the exact same
filter -- so this one hook already blanks the browser tab/SEO title too,
with nothing extra needed. A no-op unless a record actually resolved for
this request, same as `rename_edit_node()` above, and scoped to exactly
the template Page's OWN title (`$post_id` compared against
`get_queried_object_id()`, the one post/page this specific request is
actually FOR) -- a query loop or a list of other pages placed somewhere
in the same template keeps showing its own items' real titles untouched.
This only ever removes the template's own irrelevant placeholder; it
never invents a replacement heading of its own -- the right way to show
one is a `gateway/card-field-text` bound to whichever of the record's
own fields reads as its title, placed directly in the template.

**Rendering (`gateway/single-record`).** A new block, placed on the
model's own designated template Page, that does only one thing render.php
-side: validates its own `collection` attribute against the CURRENTLY
-resolved `get_query_var( 'gateway_model' )` (the same "never trust the
editor's own picker blindly" discipline every other block's render.php in
this plugin already follows for its own attributes) and, once that
checks out, passes its already-rendered `$content` straight through.
There's no per-item loop or synthetic `WP_Block` here the way `gateway/
related-items` needs one -- `Permalink_Routes::inject_record_context()`
already populated `'record'` in block context for the WHOLE page before
this block's own InnerBlocks ever rendered, so by the time render.php
runs, `$content` already reflects the real, resolved record everywhere
it's referenced. Confirmed directly against both existing consumers'
own `render.php`: `gateway/card-field-text` and `gateway/related-items`
both already read `$block->context['record']` the exact same
unnamespaced way `Data_Cards_Renderer` populates it for a Data Cards
grid, so **both work inside a Single Record template with zero render
-time code changes** -- the only actual edit either needed was adding
`"gateway/single-record"` to their own block.json `ancestor` list, purely
an editor-side insertion restriction (without it the block inserter
simply refuses to let you place either block there at all; render.php
itself was never the obstacle). `gateway/single-record` also provides
`gateway/data-cards/sourceType`/`gateway/data-cards/collection` context
(fixed to `'collection'` and the block's own chosen Collection,
respectively) purely as an editor-experience nicety, reusing the exact
two keys `gateway/data-cards` already provides -- without it, a nested
`gateway/card-field-text`'s own Field picker would show its "Choose a
Collection on the Data Cards block first" notice, which would be
actively wrong advice on a page that never has a Data Cards block on it
at all.

**A real, changeable live preview while designing the template.**
`gateway/single-record`'s own `edit.js` provides a real `record` block
context, exactly like `gateway/data-cards-body`'s own per-item preview
does, so `gateway/card-field-text`/`-number`/`-image` and
`gateway/related-items` all show real data while the template is being
designed here too, not just on the front end. By default this is
whichever record `GET .../records/search` (no `q` -- the same route
`RelateAutocomplete.jsx` already uses for a Relate field's own search
-as-you-type, reused here purely for its "no query -> the model's own
most-recent records" behavior) returns first -- "the first record it
can find." A new **Preview Record** Inspector panel, a `ComboboxControl`
backed by that same route (search-as-you-type, `q` included this time),
lets a site owner preview a DIFFERENT record instead -- stored as a new
`previewRecordId` attribute, purely an editor convenience that
`render.php` never reads at all (a real visitor's page always resolves
its own record from the URL they actually requested, completely
independent of whatever was last previewed here). An empty Collection
shows a plain Notice instead of a preview -- InnerBlocks stays fully
editable regardless, the same "record context absent" state
`gateway/card-field-text`'s own docblock already treats as normal, not
an error -- and a `previewRecordId` that 404s (the record was deleted
since it was picked) clears itself back to "first record found"
automatically rather than getting stuck. Verified with a clean
production build; this feature's own actual behavior (the live preview,
the Combobox search, the empty-Collection Notice, the self-healing
fallback) needs manual verification in a real block editor, the same
caveat every other block-editor-only UI change in this plugin already
carries (no Gutenberg-block-editor test harness exists in this project).

Verified with a new standalone PHP smoke test (routable-model
computation, the full flush-timing matrix -- first-ever flush, no flush
on an unrelated request, a flush exactly on each actual config change,
never on a routability-neutral rename -- query var registration, the
complete `resolve_record()`/`inject_record_context()` 404/found matrix
(Auto and Manual slugs alike), `rename_edit_node()`'s own three cases
against a small stub `WP_Admin_Bar` -- no record resolved leaves a
pre-existing node untouched, a resolved record with no "edit" node
fabricates nothing, a resolved record with one retitles it to "Edit
Template" while leaving its href untouched -- and `suppress_template_page_title()`'s
own three cases -- no record resolved passes a title through unchanged,
a resolved record blanks the template Page's OWN title, a resolved
record still leaves some OTHER post's own title untouched) alongside the
full existing regression suite, plus a successful production build of
the new block. Rewrite-flush timing, the real `/{root}/{slug}` HTTP
round trip, the actual admin-bar label in a real wp-admin toolbar, the
title actually disappearing from a real theme's own template, and the
block
editor's own insertion/preview behavior are genuine WordPress runtime
behavior a standalone stubbed script can't exercise -- those need
verification against a real WP install.

**A View link back to that URL, wherever a record is already shown in
the admin app.** Once a model's Permalink field is fully routed (Root
AND Template Page both set -- the exact same requirement
`Permalink_Routes::register_rules()` itself gates a rewrite rule on;
`PermalinkEditor.jsx`'s own copy already tells a site owner this),
**`admin-app/src/utils/permalink.js`**'s `getRecordPermalink( fields,
record )` is the one canonical answer to "does this record have a real
front-end URL, and what is it" -- `null` for an unrouted model, a model
whose Permalink field has no Root/Template Page configured yet, or a
record with no slug of its own yet (e.g. never saved), otherwise a real,
absolute URL built from a new `window.GatewayAdmin.homeUrl` (`home_url(
'/' )`, localized by `Admin_Page::enqueue_assets()` the same way
`apiUrl`/`wpApiUrl` already are) plus the field's own `root` setting plus
the record's own (already-unique, already-URL-safe) stored slug --
`encodeURIComponent()`'d defensively, though `resolve_permalink_value()`
already guarantees a plain, URL-safe value. `RecordsCrud.jsx` calls this
in exactly two places: a **View** button alongside each row's own
Edit/Delete in the records table (rendered only when that particular
record actually has a URL), and a **Permalink:** line at the top of the
Edit modal, the classic WordPress "Permalink: ... View" chrome under a
post's own title -- both open the record's real front end in a new tab.
Neither reads or duplicates any server-side routing logic itself; both
are pure presentation over the same plain string fields (`root`,
`template_page_id`, the slug) every other Permalink-aware screen in this
app already reads.

Verified with a new standalone Node smoke test run directly against
`getRecordPermalink()` (a fully-routed record resolving a real URL; no
Permalink field; Root unset; Template Page unset; a record with no slug
yet, both missing entirely and present-but-empty; `settings` arriving as
`[]` rather than `{}`; a slug needing URL-encoding; a null record/fields
array) alongside a successful `admin-app` production build.

### Columns (`Model_Columns`) -- configurable, sortable Records-table columns

The problem this solves: `RecordsCrud.jsx` used to render every one of a
model's own fields as a table column unconditionally -- fine for a model
with a handful of fields, cluttered fast on one with a lot of them.
**Columns**, a new tab beside Permalinks on `ModelDetail`, lets a site
owner choose which fields actually show as columns, their order, and
which of them can be clicked to sort the table -- "show or not" is the
main option, "sortable or not" a secondary, per-column one.

**`Gateway\Model_Columns`** is the smallest member of the Model_Fields/
Model_Relationships family: ONE row per model (`gateway_table_columns`,
`model` unique, `created_at`/`updated_at`), not one row per column -- an
ordered JSON list of `{key, sortable}` pairs is exactly what a single
column already models well (the same shape `gateway/datatable`'s own
`columns` block attribute already uses for its front-end column picker
-- this feature's own admin-app UI deliberately mirrors that same
picker-plus-config-table shape, see `ColumnsEditor.jsx` below), so
there's no per-row structure here worth a normalized table the way
`gateway_relationships` needs.

**Unconfigured** (no row at all -- every model starts this way) means
exactly today's PRE-EXISTING behavior: every field shows, in Fields-tab
order, none sortable. `get()` returns `null` in that case rather than a
default array, so every caller can tell "never configured" apart from
"configured to show every current field" -- genuinely different states:
the latter does NOT automatically start showing a field added to the
model later, the same way `gateway/datatable`'s own column picker
doesn't retroactively add a newly-created field to an already-published
block either.

**`set( $class_name, $columns )`** replaces a model's entire
configuration wholesale (like `Model_Fields::update()`'s own `$settings`
replace, not a merge). Every entry's own `key` must name one of the
model's OWN CURRENT fields (`Model_Fields::all()`) -- a stale key (since
renamed or removed) is silently dropped rather than rejecting the whole
save; duplicate keys collapse to their FIRST occurrence; order is
preserved exactly as given. `sortable` is forced `false`, regardless of
what was submitted, for any field with no real column to sort BY at all
-- reusing `Field_Type::blueprint_method()`'s own existing `''` "no
column, don't migrate one" signal (currently only Relate to Many, backed
by a pivot table) rather than inventing a new flag; `Field_Type_Registry::
describe_all()` now exposes this as `has_column`, which both this
server-side check and the admin app's own "Sortable" toggle eligibility
read from the same source. `forget( $class_name )` deletes a model's
config outright -- called by `Model_Builder::rename()` alongside its
existing `Model_Fields::forget()`/`Model_Relationships::forget()` calls,
for the identical reason: a rename is really "create a fresh model, drop
the old one," so config keyed to specific field names has nothing left
to apply to.

**Reaching the admin app.** `Model_REST_Controller::describe_model()`
now includes `'columns' => Model_Columns::get( $class )` alongside
`fields`/`relationships` -- the same one request `ModelDetail.jsx`
already makes seeds this tab too, no second round trip. Writing goes
through a new, dedicated `PUT /gateway/v1/models/<class>/columns`
(`Model_Column_REST_Controller`, structurally the smallest of the
Fields/Relationships/Columns REST controller trio -- no GET route of its
own, for the reason above).

**`ColumnsEditor.jsx`** deliberately mirrors `gateway/datatable`'s own
column-picker UI (`available-columns-list.js` + `column-config-table.js`)
-- a click-to-toggle "available fields" list above a drag-to-reorder
"selected columns" config table below, same class names even -- but is
its own, separately-written component: the admin app shares no build (or
`@wordpress/components`) with the Gutenberg blocks, so there's nothing to
import directly. Unlike the block's own Format button (a whole settings
MODAL, for a genuinely multi-field Number-format group), Sortable is
this feature's only per-column setting -- a single boolean fits as a
plain inline toggle button in the config table itself, no modal earns
its keep here. Opening this tab for the first time (an unconfigured
model) seeds its own local editing state with every CURRENT field, none
marked sortable -- exactly what's already effectively showing today, so
the panel starts as a working set to deselect from rather than an empty,
misleading one. A plain Save button, not autosave -- same reasoning
`PermalinkEditor.jsx`'s own docblock already gives: one coherent, ordered
arrangement, not small independent per-row units.

**Sorting, enforced server-side.** `Records_REST_Controller::list_records()`
now accepts `orderby`/`order` query params, validated by a new private
`resolve_sort()` rather than passed straight to `orderBy()` unchecked --
the same "never trust the client's own request blindly" discipline every
other write path in this plugin already follows. `id` is always allowed
(this endpoint's own long-standing default); any other `orderby` must be
BOTH one of the model's own CURRENT fields AND explicitly marked
`sortable` in its Columns configuration -- an unconfigured model allows
nothing beyond `id`, preserving pre-existing behavior exactly for every
model that hasn't opted into this feature. An invalid, missing, or
no-longer-eligible `orderby`/`order` falls back to `id`/`desc` rather
than erroring, so a bookmarked or stale sorted URL degrades gracefully.
The response echoes back the sort ACTUALLY applied (`orderby`/`order`),
which `RecordsCrud.jsx` reads to keep its own clickable column-header
indicator (`SortableHeader`, a plain inline `▲`/`▼`) honest about what
the table really reflects rather than merely what was last clicked --
add/edit/delete and pagination all now thread the current sort through
too, so none of them silently resets it back to the default.

Verified with a new standalone PHP smoke test (`Field_Type_Registry::
describe_all()`'s new `has_column` flag; the full `set()` sanitization
matrix -- a stale key dropped, a duplicate key's first occurrence wins,
a Relate to Many field's own `sortable` forced false even when
requested, a round trip through real storage reading back exactly what
was saved, a second `set()` call replacing rather than accumulating,
`forget()` clearing back to unconfigured; and `list_records()`'s own
full sort-resolution matrix -- unconfigured allows nothing but `id`,
a configured+sortable column applies exactly as requested, a configured
-but-not-sortable column still falls back, `id` always works regardless
of configuration, no `orderby` at all falls back to the same default,
and a field REMOVED after being marked sortable in a stale Columns
config never reaches a raw `ORDER BY`) alongside the full existing
regression suite (five pre-existing smoke tests needed one added
`require` each, `class-model-columns.php`, since they already exercise
`list_records()`/`Model_Builder::rename()` directly), plus a successful
`admin-app` production build. The block-editor-mirrored UI itself
(drag-reorder, the click-to-toggle list, the Sortable button's disabled
state for Relate to Many) needs manual verification in a real wp-admin
screen, the same caveat every other admin-app UI change in this plugin
already carries.

### `gateway/card-link` -- wraps other fields in a link to the record's own permalink

A card is rarely useful unlinked -- the whole point of a Data Cards grid
is usually clicking through to the full record. `gateway/card-link` is
a plain InnerBlocks wrapper (structurally the same "synthetic wrapper
block" `usesContext`/context-reading caveats every field-display block
in this family already documents) that wraps whatever's placed inside
it -- `gateway/card-field-text`, `gateway/card-field-image`, several
fields together, anything -- in a real `<a href>` pointing at the
CURRENT record's own front-end URL.

**No field to pick, by design.** Every other field-display block in
this family (`card-field-text`/`-number`/`-image`) has a Field picker,
because there could be many eligible fields to choose from. A Permalink
field is different: `Permalink_Field_Type::max_one_per_model()`
guarantees a model has AT MOST ONE, so "the" Permalink field for a given
record is never ambiguous -- there's nothing to pick, only something to
find automatically. **`Permalink_Routes::url_for_record( $record )`**
(new -- the PHP counterpart to `admin-app/src/utils/permalink.js`'s own
`getRecordPermalink()`, same shape, same reasoning, just against a real
Eloquent record instead of a REST-shaped one) is the one call that does
the whole job: finds the record's own model's Permalink field
(`Model_Fields::permalink_field_for()`), confirms it's actually routable
(`Permalink_Routes::routable_models()`'s own Root-AND-Template-Page
requirement -- factored out as a new `route_for_class( $class_name )`,
the single-model counterpart both this and `routable_models()` itself
now share), reads the record's own current slug, and builds the real,
absolute URL -- or returns `null` the instant any of that isn't true.

**No permalink available is never an error -- render.php just prints
the inner blocks completely unwrapped**, exactly as if this block
weren't there at all (same reasoning `gateway/card-field-text`'s own
"record context absent" handling already has): a card that can't be
made clickable should still show its own text/image, not disappear or
break the page.

**The editor warns instead.** Since front-end silence would otherwise
be a confusing, easy-to-miss surprise while designing a template,
`edit.js` fetches a new, dedicated `GET /gateway/v1/models/<class>/permalink`
(`Permalink_REST_Controller` -- `{ available, field, root }`, gated the
same `manage_options` way every other Collection-scoped block-editor
route already is) and shows a plain Notice the moment a Collection has
no Permalink configured yet, naming exactly what's missing (no
Permalink field at all, or one with no Root/Template Page set). Kept as
its own tiny, single-purpose controller rather than folded into
`Columns_REST_Controller`/`Model_REST_Controller` -- neither's own
response shape (a flat column array; a whole model's admin-management
payload) fits a plain `{available, field, root}` triple.

**The editor's own live preview link is best-effort**, same caveat
every other field-display block's own docblock already states: built
from `window.location.origin` (the editor and the site it's editing
always share one, so there's no need for an admin-app-style localized
`homeUrl` just for this) plus the fetched `root` plus the current
preview record's own slug value (`record[field]`) -- the REAL link a
visitor actually follows is always whatever `url_for_record()` builds
from the real, resolved record on an actual front-end render.

Verified with new checks added to the existing `permalink-routes-smoke
-test.php` (`route_for_class()`'s own routable/unroutable/unregistered
matrix; `url_for_record()` building the right URL for two different
records' own independently-computed slugs, and returning `null` for a
non-record, `null`, or a record with no slug yet; `Permalink_REST_
Controller::get_permalink_config()`'s own available/unavailable/
unregistered-model matrix) alongside the full existing regression
suite, plus a successful production build of the new block. The block
editor's own UI (the Notice, the live preview link, nesting other
field-display blocks inside it) needs manual verification in a real WP
install, the same caveat every other block-editor-only UI change in
this plugin already carries.

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

### The top-level Models/Records/Database tab strip -- active state computed by hand, not left to `NavLink`

`App.jsx`'s own `MainTabs` renders the three top-level tabs (WordPress
core's own boxed `nav-tab`/`nav-tab-active` look, unrelated to
`ModelDetail`'s own flat underlined `.gateway-subtab` style further
down) as plain `Link`s rather than `react-router-dom`'s `NavLink`, with
each one's own active/inactive class computed by hand from
`useLocation()`'s current pathname instead of left to `NavLink`'s own
built-in matching.

**The real bug this fixes**: `NavLink`'s own matching can't express what
the Models tab actually needs. `to="/"` has to pass `end` -- otherwise
it would match every route at all (`/records`, `/database`, anything),
since every path starts with `/` -- but `end` means an EXACT match
only, so the Models tab went dark the moment a row was followed into
`/models/:className` (`ModelDetail`), even though that page is still
very much part of "Models". Records never had this problem
(`/records/:className` already starts with `/records`, which
`NavLink`'s own default, non-`end` PREFIX match already covers) -- only
Models, the one tab whose own root path is `/` itself, needed the
narrower `end` match that then broke its own sub-routes. Computing all
three tabs' own active state the same explicit way here (`'/' ===
pathname || pathname.startsWith('/models')` for Models,
`pathname.startsWith('/records')`/`pathname.startsWith('/database')`
for the other two) keeps the whole strip's own logic in one place
instead of two different matching rules for what should be one
consistent behavior -- and means the Models tab now correctly stays
highlighted for the entire time a visitor is anywhere under Models,
detail page included.

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

`ModelsList` (`admin-app/src/screens/ModelsList.jsx`, route `/`) is a
"Create Model" button opening the Type + Title + Plural Title form
described above in a `Modal` (the same one Records' own "Add New"/"Edit"
already use, rather than the form sitting permanently inline above the
list),
plus the list of every model that already exists (`GET /gateway/v1/models`)
-- each row links to
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

**Every section of `ModelDetail` lives behind one text-based tab strip**
-- **General** (the Title/Plural Title form above, plus Table/Migration/
Status), **Fields** (`FieldEditor`, `admin-app/src/components/FieldEditor.jsx`
-- see "Fields (`Model_Fields`)" above for what happens on the PHP side,
and for its own single add-or-edit panel), and **Relationships**
(`RelationshipEditor`) -- rather than General sitting permanently visible
above a SEPARATE tab strip for just the other two. The tab strip itself
reuses `.gateway-subtab`/`.gateway-subtab-active` (renamed from
`FieldEditor`'s own originally-private `.gateway-field-editor-subtabs`
container class to the shared, unscoped `.gateway-subtabs`) -- the exact
same flat, underlined look `FieldEditor`'s own inner General/Validation/
Presentation/Conditional Logic tabs already use, not the boxed
`nav-tab`/`nav-tab-active` wp-admin style this page's own Fields/
Relationships strip used before. All three sections' own components stay
mounted the whole time regardless of which tab is showing (a `hidden`
attribute toggles visibility, never conditional rendering) -- General's
own typed-but-unsaved Title/Plural Title input, `FieldEditor`'s
currently-open edit panel, and `RelationshipEditor`'s own in-progress
state all survive switching away to another tab and back, the same
"never lose an in-progress edit by switching tabs" guarantee Fields/
Relationships already had before General joined them. `FieldEditor`
itself is seeded from the same initial `GET /models/<class>` response so
it doesn't need its own request just to render.

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
