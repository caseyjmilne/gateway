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
gateway.php                     Plugin bootstrap: constants + boots Block_Loader
includes/
  class-block-loader.php        Scans /blocks and register_block_type()'s every block found
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
      hooks/
        use-datatable-init.js   React hook: (re)inits DataTables against an async-rendered container
      shared/
        datatable.js            Shared DataTables init/destroy helpers (jQuery + datatables.net-dt)
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
  .getPostTypes()`, filtered to `viewable` post types. `render.php` re-checks
  the value with `post_type_exists()` and falls back to `post` -- never trust
  the attribute blindly server-side.

The grid currently always shows **ID** and **Title** columns; the query args
used to populate it are filterable via the `gateway_datatable_query_args` PHP
filter (`$query_args, $attributes, $block`) for per-site customization
(e.g. capping `posts_per_page` on very large post types, changing `orderby`).

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
