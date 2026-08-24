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
gateway.php                     Plugin bootstrap: constants + boots Block_Loader + Columns_REST_Controller
includes/
  class-block-loader.php        Scans /blocks and register_block_type()'s every block found
  class-column-registry.php     Discovers columns (core fields + meta/ACF) for a post type; renders cell values
  class-columns-rest-controller.php  GET /gateway/v1/columns/<post_type> (the block editor's column picker)
blocks/
  datatable/
    block.json                  Block metadata, attributes, asset + render wiring
    render.php                  PHP render callback (dynamic block, no save markup)
    src/
      index.js                  Editor registration (editorScript)
      edit.js                   Editor UI: InspectorControls + live SSR preview
      view.js                   Front-end entry (viewScript): finds tables, inits DataTables
      style.scss                Shared styles (front end + editor)
      controls/
        post-type-control.js    Reusable "Post Type" SelectControl
        limit-control.js        "Limit" numeric field
        page-size-control.js    "Page Size" numeric field
        columns-panel.js        Fetches available columns, orchestrates the two below
        available-columns-list.js  Click-to-toggle column selection
        column-config-table.js  Drag-to-reorder + click-to-toggle-sortable table
      hooks/
        use-datatable-init.js   React hook: (re)inits DataTables against an async-rendered container
      shared/
        datatable.js            Shared DataTables init/destroy helpers (jQuery + datatables.net-dt)
      utils/
        classnames.js           Tiny classnames() helper (no external dependency)
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

### Dynamic block, server-rendered

The datatable block has no client-side `save()` markup (it returns `null`).
All markup -- on both the front end and in the block editor -- comes from
`render.php` via `block.json`'s `"render"` field:

- **Front end:** WordPress calls `render.php` when the block is rendered in a
  post/page.
- **Editor:** `edit.js` renders `<ServerSideRender block="gateway/datatable" />`,
  which calls the exact same `render.php` through the `block-renderer` REST
  endpoint. This guarantees the editor preview is never out of sync with what
  actually ships to the front end.

### Initializing DataTables inside the Gutenberg editor

This is the part worth calling out explicitly, since it's easy to get wrong:

1. `edit.js` wraps its `<ServerSideRender>` output in a `ref`'d container and
   passes that ref to `useDataTableInit()` (`hooks/use-datatable-init.js`).
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
4. The frontend (`view.js`) uses the same `shared/datatable.js` helpers
   directly (no MutationObserver needed there, since the markup is present at
   `DOMContentLoaded`), so editor and front end always get identical
   DataTables behavior (sorting, searching/filtering, pagination, etc.).

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
     `columns` is just reordered in place on drop. (This UI lives in the
     Inspector sidebar, i.e. the editor's top-level document, not the
     iframed canvas, so there's no cross-iframe drag-and-drop concern to
     work around here, unlike the DataTables init below.)
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
- **Meta fields** (including ACF): the union of formally registered meta
  (`get_registered_meta_keys()` -- what `register_post_meta()`, and ACF's
  own "Show in REST API" support, produce) and meta keys actually found in
  `wp_postmeta` for that post type (to also surface ACF fields that were
  never formally registered, which is the common case). Protected/internal
  keys (WordPress' `_`-prefixed convention -- also how ACF stores its
  internal field-key references) are excluded via `is_protected_meta()`.
  Meta has no built-in "nice name," so labels are humanized from the raw key
  (`event_start_date` → "Event Start Date") by default, filterable via
  `gateway_datatable_column_label` for sites wanting real ACF field labels
  instead. Discovery results are cached per post type (`get_transient()`,
  15 minutes by default, filterable via `gateway_datatable_columns_cache_ttl`)
  since the meta-key scan queries `wp_postmeta` directly.

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
arrays/objects). Column order in the rendered `<thead>`/`<tbody>`
*is* DataTables' column order -- there's no separate mapping to keep in
sync. Each `<th>` also carries `data-orderable="true|false"` from the
column's `sortable` flag; `shared/datatable.js` reads those attributes to
build DataTables' `columns` option, so a column's configured sortability is
respected identically in the editor and on the front end, with no
per-caller wiring needed.

**Refreshing on column changes:** `edit.js` includes
`JSON.stringify( columns )` in the dependency array passed to
`useDataTableInit()` (alongside `postType`, `limit`, `pageSize`) --
selecting/deselecting a column, reordering, or toggling sortable all change
that attribute, which re-renders `<ServerSideRender>` with new markup, which
the hook's `MutationObserver` picks up to destroy and reinitialize
DataTables. This is the "column change" event the DataTable refresh is
keyed off of.

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

## Extending: future child blocks

The datatable block is intentionally monolithic for now, but structured so
it can be decomposed into child blocks (heading, rows, pagination, facets,
...) without a rewrite:

- **PHP:** `Block_Loader` already handles any number of block directories
  under `/blocks` with no changes needed.
- **Build:** `webpack.config.js` already compiles every `blocks/*/src/{index,view}.js`
  it finds into that block's own `build/`.
- **DataTables logic:** `shared/datatable.js`'s `initGatewayDataTable()` /
  `destroyGatewayDataTable()` are already generic over "a table element,"
  not tied to this block's markup, so child blocks (e.g. a facets/filter
  block acting on a sibling table) can reuse them directly.
- **Controls:** `controls/post-type-control.js` is already a standalone
  component for reuse in a future query/settings block.

The natural next step is converting `gateway/datatable` into a parent block
that renders `InnerBlocks` for `gateway/datatable-heading`,
`gateway/datatable-row`, `gateway/datatable-pagination`, and
`gateway/datatable-facets`, with the parent block still owning the actual
`<table>` element and DataTables instance so child blocks can reach into it
via context.
