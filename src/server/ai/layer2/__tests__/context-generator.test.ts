import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateProjectContext } from '../context-generator.js';

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'beacon-ctx-test-'));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	for (const dir of tempDirs) {
		await rm(dir, { recursive: true, force: true });
	}
	tempDirs = [];
});

describe('generateProjectContext', () => {
	it('generates context from a project with package.json', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({
				dependencies: { svelte: '^5.0.0', '@libsql/client': '^0.17.0' },
				devDependencies: { typescript: '^5.0.0', vitest: '^4.0.0' },
			}),
		);
		await writeFile(join(dir, 'tsconfig.json'), '{}');
		await mkdir(join(dir, 'src'));
		await mkdir(join(dir, 'tests'));

		const context = await generateProjectContext(dir);

		expect(context.language).toBe('typescript');
		expect(context.testFramework).toBe('vitest');
		expect(context.keyDependencies).toContain('svelte');
		expect(context.keyDependencies).toContain('@libsql/client');
		expect(context.keyDependencies).toContain('vitest');
		expect(context.projectStructure).toContain('src');
		expect(context.projectStructure).toContain('tests');
	});

	it('detects SvelteKit framework', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({
				devDependencies: { '@sveltejs/kit': '^2.0.0', svelte: '^5.0.0' },
			}),
		);

		const context = await generateProjectContext(dir);

		expect(context.framework).toBe('sveltekit');
	});

	it('detects vitest test framework', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({
				devDependencies: { vitest: '^4.0.0' },
			}),
		);

		const context = await generateProjectContext(dir);

		expect(context.testFramework).toBe('vitest');
	});

	it('detects jest test framework', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({
				devDependencies: { jest: '^29.0.0' },
			}),
		);

		const context = await generateProjectContext(dir);

		expect(context.testFramework).toBe('jest');
	});

	it('returns sensible defaults for empty directory', async () => {
		const dir = await createTempDir();

		const context = await generateProjectContext(dir);

		expect(context.framework).toBeNull();
		expect(context.language).toBe('javascript');
		expect(context.testFramework).toBeNull();
		expect(context.packageManager).toBe('npm');
		expect(context.keyDependencies).toEqual([]);
		expect(context.projectStructure).toEqual([]);
	});

	it('detects pnpm package manager from lock file', async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, 'pnpm-lock.yaml'), '');
		await writeFile(join(dir, 'package.json'), JSON.stringify({}));

		const context = await generateProjectContext(dir);

		expect(context.packageManager).toBe('pnpm');
	});

	it('detects yarn package manager from lock file', async () => {
		const dir = await createTempDir();
		await writeFile(join(dir, 'yarn.lock'), '');
		await writeFile(join(dir, 'package.json'), JSON.stringify({}));

		const context = await generateProjectContext(dir);

		expect(context.packageManager).toBe('yarn');
	});

	it('detects typescript from tsconfig.json when not in dependencies', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({ dependencies: { svelte: '^5.0.0' } }),
		);
		await writeFile(join(dir, 'tsconfig.json'), '{}');

		const context = await generateProjectContext(dir);

		expect(context.language).toBe('typescript');
	});

	it('filters out @types/* packages from key dependencies', async () => {
		const dir = await createTempDir();
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({
				devDependencies: {
					'@types/node': '^20.0.0',
					typescript: '^5.0.0',
					vitest: '^4.0.0',
				},
			}),
		);

		const context = await generateProjectContext(dir);

		expect(context.keyDependencies).not.toContain('@types/node');
		expect(context.keyDependencies).toContain('typescript');
	});

	it('excludes hidden directories and node_modules from project structure', async () => {
		const dir = await createTempDir();
		await mkdir(join(dir, '.git'));
		await mkdir(join(dir, '.svelte-kit'));
		await mkdir(join(dir, 'node_modules'));
		await mkdir(join(dir, 'src'));
		await mkdir(join(dir, 'dist'));

		const context = await generateProjectContext(dir);

		expect(context.projectStructure).toEqual(['dist', 'src']);
	});

	it('limits key dependencies to 15 entries', async () => {
		const dir = await createTempDir();
		const deps: Record<string, string> = {};
		for (let i = 0; i < 20; i++) {
			deps[`package-${String(i).padStart(2, '0')}`] = '^1.0.0';
		}
		await writeFile(
			join(dir, 'package.json'),
			JSON.stringify({ dependencies: deps }),
		);

		const context = await generateProjectContext(dir);

		expect(context.keyDependencies.length).toBe(15);
	});
});
