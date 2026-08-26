import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Builds a single, dependency-free IIFE bundle -- app.js + app.css -- that
 * a plain wp_enqueue_script()/wp_enqueue_style() call can load as-is, the
 * same way each Gutenberg block's own @wordpress/scripts build produces one
 * non-module bundle per entry point. IIFE output means no <script
 * type="module">, no CORS/MIME concerns, and no separate React/ReactDOM
 * externals to also enqueue -- everything needed is bundled into app.js.
 *
 * `npm run dev` (Vite's own dev server, for local iteration against mocked
 * data) is unaffected by this -- these settings only apply to `vite build`.
 */
export default defineConfig( {
	plugins: [ react() ],
	build: {
		outDir: 'build',
		emptyOutDir: true,
		cssCodeSplit: false,
		rollupOptions: {
			input: 'src/main.jsx',
			output: {
				format: 'iife',
				entryFileNames: 'app.js',
				assetFileNames: 'app.[ext]',
			},
		},
	},
} );
