# Gateway

A WordPress plugin for custom Gutenberg blocks, starting with a **Data Table**
block: a sortable, searchable grid of posts for any registered post type,
powered by [DataTables](https://datatables.net/).

## Requirements

- WordPress 6.3+
- PHP 7.4+
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
        facet-config-table.js   Drag-to-reorder + compare/value table
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
      edit.js                   Editor UI: a static preview (no settings to configure)
      view.js                   Front-end entry: drives the sibling DataTable's page.len() API
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
      edit.js                   Editor UI: a static preview (no settings to configure)
      view.js                   Front-end entry: drives the sibling DataTable's page() API
      style.scss                Pagination control styles
    build/                      Compiled output (generated, do not hand-edit)
  datatable-results/
    block.json                  Block metadata, parent restricting it to gateway/datatable-footer
    render.php                  PHP render callback: an empty "Showing X to Y of Z entries" skeleton
    src/
      index.js                  Editor registration
      edit.js                   Editor UI: a static preview (no settings to configure)
      view.js                   Front-end entry: builds the info text from the sibling DataTable's page.info()
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
  and remove ("×") button, but each row carries a **Compare** `<select>`
  (Equals, Not Equals, Greater/Less Than (or Equal), Contains, Does Not
  Contain -- `controls/facet-compare-options.js`) and a **Value** `<input>`
  instead of a Sortable toggle. Per the current spec, Value is a plain text
  field; loading a field's actual distinct values into a picker instead is
  a natural later step this structure doesn't block.
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
  `controls/facet-config-table.js` restricts the Facets panel's own Compare
  dropdown down to just Equals/Not Equals for a taxonomy facet, so a site
  owner never sees options that would be silently coerced anyway.
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
  REQUIRED_BLOCKS, templateLock: false })` renders one list -- exactly
  four named container blocks (`gateway/datatable-facets`,
  `-header`, `-body`, `-footer`), in that fixed order. `useRequiredInnerBlocks()`
  (below) is what actually guarantees all four exist, seeding a
  brand-new datatable block with all of them (Header pre-populated with
  Page Size + Search, Footer with Pagination + Results) the same way a
  `template` would, but also *repairing* an existing block that's missing
  one -- see "Self-healing structure" below for why that's a `template`
  can't safely be relied on for both at once.
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

### Self-healing structure, not a locked `template`

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
Footer outright**,
replacing it with a fresh, empty one -- silently throwing away a site
owner's own Pagination/Results configuration the moment the post was next
opened and saved. (The same class of bug would have hit the Facets block
being added here in exactly the same way.)

`useRequiredInnerBlocks()` (`hooks/use-required-inner-blocks.js`) replaces
both the seeding and the repair with one name-based mechanism that can't
make that mistake: on every render, it checks which of the required names
are genuinely *absent* (never "in the wrong place"), and inserts only the
first missing one, at a position computed from *which other required
blocks already exist* -- never removing or replacing anything. Since
`insertBlock()` changes the block list, the hook naturally re-runs and
repeats until every required block is present, at which point it's a
no-op on every subsequent render. This handles both cases the old
`template` did (a brand-new block, with nothing yet, converges to the full
skeleton in a few render passes) *and* the migration case it got
dangerously wrong (an existing block missing only the newest required
addition gets exactly that one inserted, with everything else -- including
whatever a site owner configured inside Header/Footer -- left completely
untouched).

**If you have existing content saved between this bug being introduced and
this fix:** reopening and re-saving is what triggers the repair (this all
runs in the editor, not on the front end) -- but if a datatable block was
already re-saved *while* the broken `templateLock: 'all'` version was live,
its Footer's Pagination/Results configuration may already have been
silently reset to defaults, and that specific loss isn't something this
fix can recover on its own (check post revisions if that content mattered).

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
nesting doesn't break it). Each one's `render.php` doesn't need
`gateway/datatable`'s inner-block-splitting treatment at all: with nothing
else to interleave around, `echo $content;` (after a `count( $block
->inner_blocks ) === 0` check, so an unused one renders nothing rather
than an empty box) is exactly the right output. `gateway/datatable-body`
is the one with real work to do -- see below.

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
- **The fix: mirror context into this block's own (otherwise-unused)
  attributes, from `edit.js`.** `gateway/datatable-body`'s `block.json`
  declares the same five as both `usesContext` *and* its own attributes.
  `edit.js` runs a `useEffect` that calls `setAttributes()` with the
  current context values whenever they change, so `<ServerSideRender
  block="gateway/datatable-body" attributes={attributes} />` always has
  something equivalent to send. `render.php` prefers real `$block->context`
  and only reads these mirrored attributes when context is empty -- so on
  every render *except* this one editor-preview case, they're inert,
  stale-by-definition copies that are never actually read.
  - An `isSynced` check gates which one <ServerSideRender> is called with
    across the one render right after context changes (`setAttributes()`
    is async, so `attributes` still holds the *previous* sync on that
    render) -- a `<Spinner />` shows instead of a request built from
    stale-or-default values for that one moment.
  - The sync is wrapped in `__unstableMarkNextChangeAsNotPersistent(
    { history: 'ignore' } )` (a `core/block-editor` store action). Without
    it, this effect firing on every page load would mark the post dirty
    ("unsaved changes") and pollute undo history purely from opening it --
    for a change nothing about it represents a user edit; the real,
    undoable source of truth is the parent's own attributes, which this
    never touches.
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
(`src/edit.js`'s `FacetPreview`, which doesn't run through render.php) mirrors
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

**Why blocks, not just leaving DataTables' own built-in widgets in place:**
so their position on the page is something a site owner controls the same
way as everything else in the InnerBlocks area, and so their markup can be
restyled like any other block, rather than being stuck with whatever
`<div>` structure DataTables generates internally.

**No settings, no context.** Unlike `gateway/facet`, neither block targets
a specific column or needs to know the parent's `postType`/`columns`/
`facets` -- each drives one whole-table DataTables feature, so neither
declares `usesContext` or has attributes. Both `edit.js`s are static
previews with no `InspectorControls` at all.

**Server-side rendering:** each renders an empty skeleton and nothing
more -- `gateway/pagination`'s disabled Previous/Next buttons and an empty
page-number container; `gateway/datatable-results`'s an otherwise-bare,
empty `<div>`. There's nothing more meaningful to render for either: the
actual counts depend on DataTables' own client-side paging/filtering
state, which can also shift as live `gateway/facet` filters are applied,
neither of which is knowable at server-render time (the same reasoning
`gateway/facet`'s Select/Checkboxes options rely on real data while the
*interactivity* is entirely client-side).

**Where they actually render:** below the `<table>`, unconditionally --
each can only ever be nested inside a `gateway/datatable-footer` block,
and the Footer always renders below the table (see "Header/body/footer"
above). There's no positioning ambiguity left to resolve here the way
there briefly was when facet/pagination shared one flat InnerBlocks list.

**Front-end hookup:** both find the sibling table exactly like
`gateway/facet` does (`shared/wait-for-datatable.js`'s
`findDataTableElement()` + `waitForDataTable()`).

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
- **Controls:** `controls/post-type-control.js` is already a standalone
  component for reuse in a future query/settings block.
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
