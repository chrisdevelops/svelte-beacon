import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			pages: '../dist/dashboard',
			assets: '../dist/dashboard',
			fallback: 'index.html',
		}),
		paths: {
			base: '/__beacon',
		},
	},
};

export default config;
