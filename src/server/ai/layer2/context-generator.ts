/**
 * Layer 2: Project context generator.
 *
 * Scans the host project's filesystem to build a ProjectContext object
 * that is included in the agent's prompt. This runs fresh on every
 * agent start -- never cached.
 *
 * This module does not import from Layer 1.
 */

import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProjectContext {
	framework: string | null;
	language: string;
	testFramework: string | null;
	packageManager: string;
	keyDependencies: string[];
	projectStructure: string[];
}

const FRAMEWORK_DETECTORS: ReadonlyArray<{ key: string; name: string }> = [
	{ key: '@sveltejs/kit', name: 'sveltekit' },
	{ key: 'next', name: 'next' },
	{ key: 'nuxt', name: 'nuxt' },
	{ key: '@angular/core', name: 'angular' },
	{ key: 'gatsby', name: 'gatsby' },
	{ key: '@remix-run/node', name: 'remix' },
];

const TEST_FRAMEWORK_DETECTORS: ReadonlyArray<{ key: string; name: string }> = [
	{ key: 'vitest', name: 'vitest' },
	{ key: 'jest', name: 'jest' },
	{ key: 'mocha', name: 'mocha' },
];

const LOCK_FILE_MAP: ReadonlyArray<{ file: string; manager: string }> = [
	{ file: 'pnpm-lock.yaml', manager: 'pnpm' },
	{ file: 'yarn.lock', manager: 'yarn' },
	{ file: 'bun.lockb', manager: 'bun' },
];

/**
 * Maximum number of key dependencies to include in the context.
 * Keeps the prompt focused on the most relevant packages.
 */
const MAX_KEY_DEPS = 15;

/**
 * Generate fresh project context by scanning the filesystem.
 *
 * @param projectRoot - Absolute path to the project root. Defaults to process.cwd().
 * @returns A ProjectContext describing the host project.
 */
export async function generateProjectContext(projectRoot?: string): Promise<ProjectContext> {
	const root = projectRoot ?? process.cwd();

	const allDeps = await readAllDependencies(root);
	const framework = detectFramework(allDeps);
	const language = await detectLanguage(allDeps, root);
	const testFramework = detectTestFramework(allDeps);
	const packageManager = await detectPackageManager(root);
	const keyDependencies = filterKeyDependencies(allDeps);
	const projectStructure = await readProjectStructure(root);

	return {
		framework,
		language,
		testFramework,
		packageManager,
		keyDependencies,
		projectStructure,
	};
}

/**
 * Read and merge dependencies + devDependencies from package.json.
 */
async function readAllDependencies(root: string): Promise<Record<string, string>> {
	try {
		const raw = await readFile(join(root, 'package.json'), 'utf-8');
		const pkg = JSON.parse(raw) as Record<string, unknown>;

		const deps = (pkg['dependencies'] ?? {}) as Record<string, string>;
		const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>;

		return { ...deps, ...devDeps };
	} catch {
		return {};
	}
}

/**
 * Detect the primary framework from dependency keys.
 */
function detectFramework(allDeps: Record<string, string>): string | null {
	for (const detector of FRAMEWORK_DETECTORS) {
		if (detector.key in allDeps) {
			return detector.name;
		}
	}
	return null;
}

/**
 * Detect whether the project uses TypeScript or JavaScript.
 */
async function detectLanguage(allDeps: Record<string, string>, root: string): Promise<string> {
	if ('typescript' in allDeps) {
		return 'typescript';
	}

	try {
		await access(join(root, 'tsconfig.json'));
		return 'typescript';
	} catch {
		return 'javascript';
	}
}

/**
 * Detect the test framework from dependency keys.
 */
function detectTestFramework(allDeps: Record<string, string>): string | null {
	for (const detector of TEST_FRAMEWORK_DETECTORS) {
		if (detector.key in allDeps) {
			return detector.name;
		}
	}
	return null;
}

/**
 * Detect the package manager by checking for lock files.
 * Falls back to 'npm' if no lock file is found.
 */
async function detectPackageManager(root: string): Promise<string> {
	for (const entry of LOCK_FILE_MAP) {
		try {
			await access(join(root, entry.file));
			return entry.manager;
		} catch {
			// Lock file not found, try next
		}
	}
	return 'npm';
}

/**
 * Filter dependencies to the most meaningful ones, skipping @types/* packages.
 * Returns at most MAX_KEY_DEPS entries, sorted alphabetically.
 */
function filterKeyDependencies(allDeps: Record<string, string>): string[] {
	return Object.keys(allDeps)
		.filter((name) => !name.startsWith('@types/'))
		.sort()
		.slice(0, MAX_KEY_DEPS);
}

/**
 * Read top-level directory names from the project root.
 * Skips hidden directories (starting with '.') and node_modules.
 */
async function readProjectStructure(root: string): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.filter((name) => !name.startsWith('.') && name !== 'node_modules')
			.sort();
	} catch {
		return [];
	}
}
