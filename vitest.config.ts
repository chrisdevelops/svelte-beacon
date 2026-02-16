import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts', 'cli/**/*.test.ts'],
		isolate: true,
		testTimeout: 10_000,
		setupFiles: ['./test/setup.ts'],
	},
});
