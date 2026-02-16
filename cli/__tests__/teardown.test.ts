import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { createTempDir, removeTempDir } from '../../test/helpers.js';
import { runInit } from '../init.js';
import { runTeardown } from '../teardown.js';

describe('CLI teardown', () => {
	let cwd: string;
	const con = { log: vi.fn() };

	beforeEach(async () => {
		cwd = await createTempDir();
		con.log.mockClear();
	});

	afterEach(async () => {
		await removeTempDir(cwd);
	});

	it('removes .beacon/ directory', async () => {
		await runInit({ cwd, console: con });
		expect(existsSync(`${cwd}/.beacon`)).toBe(true);

		con.log.mockClear();
		await runTeardown({ cwd, confirm: true, console: con });

		expect(existsSync(`${cwd}/.beacon`)).toBe(false);
	});

	it('no-op when .beacon/ does not exist', async () => {
		await expect(
			runTeardown({ cwd, confirm: true, console: con }),
		).resolves.not.toThrow();

		const output = con.log.mock.calls.map((c) => c[0]).join('\n');
		expect(output).toContain('nothing to remove');
	});

	it('skips when confirm is false', async () => {
		await runInit({ cwd, console: con });
		con.log.mockClear();

		await runTeardown({ cwd, confirm: false, console: con });

		expect(existsSync(`${cwd}/.beacon`)).toBe(true);
		const output = con.log.mock.calls.map((c) => c[0]).join('\n');
		expect(output).toContain('cancelled');
	});

	it('prints removal instructions', async () => {
		await runInit({ cwd, console: con });
		con.log.mockClear();

		await runTeardown({ cwd, confirm: true, console: con });

		const output = con.log.mock.calls.map((c) => c[0]).join('\n');
		expect(output).toContain('hooks.server.ts');
		expect(output).toContain('+layout.svelte');
	});
});
