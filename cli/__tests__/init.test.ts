import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createTempDir, removeTempDir } from '../../test/helpers.js';
import { runInit } from '../init.js';

describe('CLI init', () => {
	let cwd: string;
	const con = { log: vi.fn() };

	beforeEach(async () => {
		cwd = await createTempDir();
		con.log.mockClear();
	});

	afterEach(async () => {
		await removeTempDir(cwd);
	});

	it('creates .beacon/ directory structure', async () => {
		await runInit({ cwd, console: con });

		expect(existsSync(join(cwd, '.beacon'))).toBe(true);
		expect(existsSync(join(cwd, '.beacon', 'storage'))).toBe(true);
		expect(existsSync(join(cwd, '.beacon', 'storage', 'screenshots'))).toBe(true);
		expect(existsSync(join(cwd, '.beacon', 'storage', 'attachments'))).toBe(true);
	});

	it('creates default config.json', async () => {
		await runInit({ cwd, console: con });

		const configPath = join(cwd, '.beacon', 'config.json');
		expect(existsSync(configPath)).toBe(true);

		const config = JSON.parse(readFileSync(configPath, 'utf-8'));
		expect(config).toEqual({ lastSyncAt: null });
	});

	it('creates .gitignore when missing', async () => {
		await runInit({ cwd, console: con });

		const gitignorePath = join(cwd, '.gitignore');
		expect(existsSync(gitignorePath)).toBe(true);

		const content = readFileSync(gitignorePath, 'utf-8');
		expect(content).toContain('.beacon/');
	});

	it('appends to existing .gitignore', async () => {
		const gitignorePath = join(cwd, '.gitignore');
		const { writeFileSync } = await import('fs');
		writeFileSync(gitignorePath, 'node_modules\n');

		await runInit({ cwd, console: con });

		const content = readFileSync(gitignorePath, 'utf-8');
		expect(content).toContain('node_modules');
		expect(content).toContain('.beacon/');
	});

	it('does not duplicate .beacon/ entry', async () => {
		await runInit({ cwd, console: con });
		con.log.mockClear();
		await runInit({ cwd, console: con });

		const content = readFileSync(join(cwd, '.gitignore'), 'utf-8');
		const matches = content.match(/\.beacon\//g);
		expect(matches).toHaveLength(1);
	});

	it('is idempotent', async () => {
		await runInit({ cwd, console: con });

		const configBefore = readFileSync(join(cwd, '.beacon', 'config.json'), 'utf-8');

		con.log.mockClear();
		await runInit({ cwd, console: con });

		const configAfter = readFileSync(join(cwd, '.beacon', 'config.json'), 'utf-8');
		expect(configAfter).toBe(configBefore);
		expect(existsSync(join(cwd, '.beacon', 'storage', 'screenshots'))).toBe(true);
	});

	it('prints integration instructions', async () => {
		await runInit({ cwd, console: con });

		const output = con.log.mock.calls.map((c) => c[0]).join('\n');
		expect(output).toContain('hooks.server.ts');
		expect(output).toContain('+layout.svelte');
	});
});
