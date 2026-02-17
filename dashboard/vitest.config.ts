import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib'),
		},
		conditions: ['browser'],
	},
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts'],
		isolate: true,
		testTimeout: 10_000,
	},
});
