import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import {
	generateBranchName,
	createBranch,
	commitChanges,
	pushBranch,
	createPR,
	performGitOperations,
} from '../git.js';

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const mockExecFile = vi.mocked(execFile);

function setupMockExecFile(behavior?: (cmd: string, args: string[]) => { error: Error | null; stdout: string; stderr: string }): void {
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
				cb(null, '', '');
			}
		}
		return {} as ChildProcess;
	}) as typeof execFile);
}

describe('generateBranchName', () => {
	it('produces correct format from task data', () => {
		const result = generateBranchName({
			type: 'bug',
			publicId: 42,
			description: 'Login button not responding',
		});

		expect(result).toBe('beacon/bug-42-login-button-not-responding');
	});

	it('handles special characters in description', () => {
		const result = generateBranchName({
			type: 'feature',
			publicId: 7,
			description: 'Add "dark mode" support (v2.0)!',
		});

		expect(result).toBe('beacon/feature-7-add-dark-mode-support-v20');
	});

	it('truncates long descriptions at a word boundary', () => {
		const result = generateBranchName({
			type: 'bug',
			publicId: 99,
			description: 'The navigation menu breaks on mobile when the viewport is resized below 320 pixels',
		});

		// The slug should be at most ~40 chars, truncated at a hyphen
		const slug = result.replace('beacon/bug-99-', '');
		expect(slug.length).toBeLessThanOrEqual(40);
		expect(slug.endsWith('-')).toBe(false);
		expect(result).toMatch(/^beacon\/bug-99-/);
	});
});

describe('createBranch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls git checkout -b with the branch name', async () => {
		setupMockExecFile();

		await createBranch('beacon/bug-42-fix-login');

		expect(mockExecFile).toHaveBeenCalledOnce();
		const [cmd, args] = mockExecFile.mock.calls[0]! as [string, string[], ...unknown[]];
		expect(cmd).toBe('git');
		expect(args).toEqual(['checkout', '-b', 'beacon/bug-42-fix-login']);
	});

	it('throws on git failure', async () => {
		setupMockExecFile(() => ({
			error: new Error('branch already exists'),
			stdout: '',
			stderr: 'fatal: A branch named beacon/bug-42 already exists.',
		}));

		await expect(createBranch('beacon/bug-42')).rejects.toThrow('git checkout failed');
	});
});

describe('commitChanges', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls git add -A then git commit -m', async () => {
		setupMockExecFile();

		await commitChanges('fix: login button');

		expect(mockExecFile).toHaveBeenCalledTimes(2);
		const [, addArgs] = mockExecFile.mock.calls[0]! as [string, string[], ...unknown[]];
		const [, commitArgs] = mockExecFile.mock.calls[1]! as [string, string[], ...unknown[]];
		expect(addArgs).toEqual(['add', '-A']);
		expect(commitArgs).toEqual(['commit', '-m', 'fix: login button']);
	});
});

describe('pushBranch', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls git push -u origin with the branch name', async () => {
		setupMockExecFile();

		await pushBranch('beacon/bug-42-fix');

		expect(mockExecFile).toHaveBeenCalledOnce();
		const [, args] = mockExecFile.mock.calls[0]! as [string, string[], ...unknown[]];
		expect(args).toEqual(['push', '-u', 'origin', 'beacon/bug-42-fix']);
	});
});

describe('createPR', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns the PR URL on success', async () => {
		setupMockExecFile(() => ({
			error: null,
			stdout: 'https://github.com/user/repo/pull/1',
			stderr: '',
		}));

		const url = await createPR('beacon/bug-42-fix', {
			publicId: 42,
			description: 'Fix login button',
			type: 'bug',
		});

		expect(url).toBe('https://github.com/user/repo/pull/1');
	});

	it('returns null on gh command failure', async () => {
		setupMockExecFile(() => ({
			error: new Error('gh not found'),
			stdout: '',
			stderr: 'command not found: gh',
		}));

		const url = await createPR('beacon/bug-42-fix', {
			publicId: 42,
			description: 'Fix login button',
			type: 'bug',
		});

		expect(url).toBeNull();
	});
});

describe('performGitOperations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('calls operations in order and returns branch and PR URL', async () => {
		const callOrder: string[] = [];
		setupMockExecFile((cmd, args) => {
			if (cmd === 'git') {
				callOrder.push(`git ${args[0]}`);
			} else if (cmd === 'gh') {
				callOrder.push('gh pr create');
				return { error: null, stdout: 'https://github.com/user/repo/pull/5', stderr: '' };
			}
			return { error: null, stdout: '', stderr: '' };
		});

		const result = await performGitOperations(
			{ type: 'bug', publicId: 5, description: 'Fix crash' },
			{ createPR: true },
		);

		expect(callOrder).toEqual([
			'git checkout',
			'git add',
			'git commit',
			'git push',
			'gh pr create',
		]);
		expect(result.branch).toBe('beacon/bug-5-fix-crash');
		expect(result.prUrl).toBe('https://github.com/user/repo/pull/5');
	});

	it('skips PR creation when config.createPR is false', async () => {
		const callOrder: string[] = [];
		setupMockExecFile((cmd, args) => {
			if (cmd === 'git') callOrder.push(`git ${args[0]}`);
			if (cmd === 'gh') callOrder.push('gh');
			return { error: null, stdout: '', stderr: '' };
		});

		const result = await performGitOperations(
			{ type: 'feature', publicId: 3, description: 'Add dark mode' },
			{ createPR: false },
		);

		expect(callOrder).not.toContain('gh');
		expect(result.branch).toBe('beacon/feature-3-add-dark-mode');
		expect(result.prUrl).toBeNull();
	});

	it('returns partial results on git failure', async () => {
		setupMockExecFile((_cmd, args) => {
			if (args[0] === 'checkout') {
				return { error: new Error('branch exists'), stdout: '', stderr: 'fatal: branch exists' };
			}
			return { error: null, stdout: '', stderr: '' };
		});

		const result = await performGitOperations(
			{ type: 'bug', publicId: 1, description: 'Fix it' },
			{ createPR: true },
		);

		// Should not throw; returns branch name even on failure
		expect(result.branch).toBe('beacon/bug-1-fix-it');
		expect(result.prUrl).toBeNull();
	});
});
