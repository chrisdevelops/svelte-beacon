/**
 * Layer 2: Verification steps run after the AI agent completes its work.
 *
 * Runs TypeScript compilation, tests, and linting to validate that the
 * agent's changes do not break the project. Each step runs independently;
 * a failure in one step does not prevent subsequent steps from running.
 *
 * This module does not import from Layer 1.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface VerificationResult {
	step: string;
	passed: boolean;
	output: string;
}

const STEP_TIMEOUT_MS = 120_000;

/**
 * Run a single verification step by executing a command.
 * Captures stdout and stderr. Returns a result indicating pass or fail.
 */
async function runStep(
	name: string,
	command: string,
	args: string[],
	cwd: string,
): Promise<VerificationResult> {
	return new Promise<VerificationResult>((resolve) => {
		execFile(command, args, { cwd, timeout: STEP_TIMEOUT_MS }, (error, stdout, stderr) => {
			const output = [stdout, stderr].filter(Boolean).join('\n').trim();
			if (error) {
				resolve({ step: name, passed: false, output: output || error.message });
			} else {
				resolve({ step: name, passed: true, output });
			}
		});
	});
}

/**
 * Detect whether an ESLint configuration file exists in the project root.
 */
function hasEslintConfig(projectRoot: string): boolean {
	const configFiles = [
		'eslint.config.js',
		'eslint.config.mjs',
		'eslint.config.cjs',
		'.eslintrc.js',
		'.eslintrc.cjs',
		'.eslintrc.json',
		'.eslintrc.yml',
		'.eslintrc.yaml',
		'.eslintrc',
	];
	return configFiles.some((file) => existsSync(join(projectRoot, file)));
}

/**
 * Run the full verification checklist on the project.
 *
 * Steps:
 * 1. TypeScript compilation check (`tsc --noEmit`)
 * 2. Test suite (`npx vitest run`)
 * 3. Linting (`npx eslint .`) -- only if an ESLint config is present
 *
 * Each step captures its output and records pass/fail independently.
 * A failing step does not prevent subsequent steps from running.
 */
export async function runVerification(projectRoot?: string): Promise<VerificationResult[]> {
	const cwd = projectRoot ?? process.cwd();
	const results: VerificationResult[] = [];

	// 1. TypeScript
	results.push(await runStep('TypeScript', 'npx', ['tsc', '--noEmit'], cwd));

	// 2. Tests
	results.push(await runStep('Tests', 'npx', ['vitest', 'run'], cwd));

	// 3. Lint (only if ESLint config exists)
	if (hasEslintConfig(cwd)) {
		results.push(await runStep('Lint', 'npx', ['eslint', '.'], cwd));
	}

	return results;
}
