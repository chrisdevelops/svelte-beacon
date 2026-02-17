import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	execFile: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:fs')>()),
	existsSync: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { runVerification } from '../verification.js';
import type { VerificationResult } from '../verification.js';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);

function setupMockExecFile(
	behavior?: (cmd: string, args: string[]) => { error: Error | null; stdout: string; stderr: string },
): void {
	mockExecFile.mockImplementation(((
		cmd: string,
		args: string[],
		opts: unknown,
		callback?: ExecFileCallback,
	) => {
		const cb = typeof opts === 'function' ? (opts as ExecFileCallback) : callback;
		if (cb) {
			if (behavior) {
				const result = behavior(cmd, args);
				cb(result.error, result.stdout, result.stderr);
			} else {
				cb(null, 'ok', '');
			}
		}
		return {} as ChildProcess;
	}) as typeof execFile);
}

describe('runVerification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: no eslint config
		mockExistsSync.mockReturnValue(false);
	});

	it('returns results for all steps when they pass', async () => {
		setupMockExecFile(() => ({
			error: null,
			stdout: 'All checks passed',
			stderr: '',
		}));

		const results = await runVerification('/fake/project');

		// Without eslint config, only 2 steps
		expect(results).toHaveLength(2);
		expect(results[0]!.step).toBe('TypeScript');
		expect(results[1]!.step).toBe('Tests');
	});

	it('marks a passing step with passed: true and includes output', async () => {
		setupMockExecFile(() => ({
			error: null,
			stdout: 'No errors found',
			stderr: '',
		}));

		const results = await runVerification('/fake/project');
		const tsResult = results.find((r): r is VerificationResult => r.step === 'TypeScript');

		expect(tsResult).toBeDefined();
		expect(tsResult!.passed).toBe(true);
		expect(tsResult!.output).toBe('No errors found');
	});

	it('marks a failing step with passed: false and includes error output', async () => {
		setupMockExecFile((_cmd, args) => {
			if (args.includes('tsc')) {
				return {
					error: new Error('exit code 1'),
					stdout: '',
					stderr: 'src/index.ts(5,3): error TS2322: Type mismatch',
				};
			}
			return { error: null, stdout: 'ok', stderr: '' };
		});

		const results = await runVerification('/fake/project');
		const tsResult = results.find((r): r is VerificationResult => r.step === 'TypeScript');

		expect(tsResult).toBeDefined();
		expect(tsResult!.passed).toBe(false);
		expect(tsResult!.output).toContain('TS2322');
	});

	it('continues running remaining steps after a failure', async () => {
		setupMockExecFile((_cmd, args) => {
			// TypeScript fails
			if (args.includes('tsc')) {
				return {
					error: new Error('tsc failed'),
					stdout: '',
					stderr: 'compilation error',
				};
			}
			// Tests pass
			return { error: null, stdout: 'tests passed', stderr: '' };
		});

		const results = await runVerification('/fake/project');

		expect(results).toHaveLength(2);
		expect(results[0]!.step).toBe('TypeScript');
		expect(results[0]!.passed).toBe(false);
		expect(results[1]!.step).toBe('Tests');
		expect(results[1]!.passed).toBe(true);
	});

	it('includes lint step when ESLint config is present', async () => {
		// Simulate eslint.config.js existing
		mockExistsSync.mockImplementation((filePath) => {
			if (typeof filePath === 'string' && filePath.endsWith('eslint.config.js')) {
				return true;
			}
			return false;
		});

		setupMockExecFile(() => ({
			error: null,
			stdout: 'ok',
			stderr: '',
		}));

		const results = await runVerification('/fake/project');

		expect(results).toHaveLength(3);
		expect(results[0]!.step).toBe('TypeScript');
		expect(results[1]!.step).toBe('Tests');
		expect(results[2]!.step).toBe('Lint');
	});

	it('omits lint step when no ESLint config is found', async () => {
		mockExistsSync.mockReturnValue(false);

		setupMockExecFile(() => ({
			error: null,
			stdout: 'ok',
			stderr: '',
		}));

		const results = await runVerification('/fake/project');

		expect(results).toHaveLength(2);
		const stepNames = results.map((r) => r.step);
		expect(stepNames).not.toContain('Lint');
	});
});
