import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		conditions: ['browser'],
	},
	test: {
		environment: 'node',
		environmentMatchGlobs: [
			['src/widget/**', 'jsdom'],
		],
		include: ['src/**/*.test.ts', 'cli/**/*.test.ts'],
		isolate: true,
		testTimeout: 10_000,
		setupFiles: ['./test/setup.ts'],
	},
});
