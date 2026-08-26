# Gateway admin app

The React app behind the Gateway plugin's single wp-admin page. Plain React
built with [Vite](https://vitejs.dev/) -- deliberately **not**
`@wordpress/scripts` -- kept as its own self-contained project (own
`package.json`, own `vite.config.js`, own `node_modules/`) so it never
shares a build pipeline, dependency versions, or webpack config with the
Gutenberg blocks under `../blocks/`. See the main `README.md`'s "The Gateway
admin app" section for how this is wired into WordPress.

## Building

```bash
cd admin-app
npm install
npm run build
```

`npm run build` produces `build/app.js` and `build/app.css` -- a single,
dependency-free bundle (Vite configured for IIFE output; see
`vite.config.js`'s own comment for why) that `Admin_Page` enqueues directly
with `wp_enqueue_script()`/`wp_enqueue_style()`, no bundler-aware loader
needed on the WordPress side.

**`build/` is committed to the repository**, same as every block's own
`build/` directory -- a site installing this plugin never runs `npm
install`/`npm run build` itself. Re-run `npm run build` and commit the
result after changing anything under `src/`.

## Local development

```bash
npm run dev
```

Starts Vite's own dev server against `index.html` (not used by WordPress at
all -- see that file's own comment). Since `window.GatewayAdmin` -- the
REST API URL and nonce `Admin_Page` normally injects -- doesn't exist
outside wp-admin, API calls made this way will fail; this mode is for
iterating on layout/markup/component structure, not for exercising the real
REST endpoints. Testing against real data means running `npm run build` and
reloading the actual wp-admin page.
