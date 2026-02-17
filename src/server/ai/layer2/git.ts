/**
 * Layer 2: Git operations for the AI agent.
 *
 * All git commands use `node:child_process.execFile` wrapped in promises.
 * This module does not import from Layer 1.
 */

import { execFile } from 'node:child_process';

/**
 * Execute a git command and return stdout.
 * Rejects with an error that includes stderr on failure.
 */
function execGit(args: string[], cwd?: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		execFile('git', args, { cwd: cwd ?? process.cwd() }, (error, stdout, stderr) => {
			if (error) {
				const message = stderr.trim() || error.message;
				reject(new Error(`git ${args[0]} failed: ${message}`));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

/**
 * Execute an arbitrary command and return stdout.
 * Used for `gh` CLI invocations.
 */
function execCommand(cmd: string, args: string[], cwd?: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		execFile(cmd, args, { cwd: cwd ?? process.cwd() }, (error, stdout, stderr) => {
			if (error) {
				const message = stderr.trim() || error.message;
				reject(new Error(`${cmd} failed: ${message}`));
				return;
			}
			resolve(stdout.trim());
		});
	});
}

/**
 * Convert a description string into a URL-safe kebab-case slug,
 * truncated to approximately 40 characters at a word boundary.
 */
function slugify(text: string): string {
	const slug = text
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');

	if (slug.length <= 40) {
		return slug;
	}

	// Truncate at a word boundary (hyphen)
	const truncated = slug.substring(0, 40);
	const lastHyphen = truncated.lastIndexOf('-');
	if (lastHyphen > 10) {
		return truncated.substring(0, lastHyphen);
	}
	return truncated;
}

/**
 * Generate a branch name for the AI agent's work on a task.
 *
 * Format: `beacon/{type}-{publicId}-{slug}`
 * Example: `beacon/bug-42-login-button-not-responding`
 */
export function generateBranchName(task: {
	type: string;
	publicId: number;
	description: string;
}): string {
	const slug = slugify(task.description);
	return `beacon/${task.type}-${task.publicId}-${slug}`;
}

/**
 * Create a new git branch and check it out.
 */
export async function createBranch(branchName: string, cwd?: string): Promise<void> {
	await execGit(['checkout', '-b', branchName], cwd);
}

/**
 * Stage all changes and commit with the given message.
 */
export async function commitChanges(message: string, cwd?: string): Promise<void> {
	await execGit(['add', '-A'], cwd);
	await execGit(['commit', '-m', message], cwd);
}

/**
 * Push the branch to origin with upstream tracking.
 */
export async function pushBranch(branchName: string, cwd?: string): Promise<void> {
	await execGit(['push', '-u', 'origin', branchName], cwd);
}

/**
 * Create a pull request using the GitHub CLI (`gh`).
 *
 * Returns the PR URL on success, or null if the command fails.
 * PR creation failure is not fatal -- the agent can still complete
 * without a PR.
 */
export async function createPR(
	branchName: string,
	task: { publicId: number; description: string; type: string },
	cwd?: string,
): Promise<string | null> {
	const titleDesc = task.description.length > 60
		? task.description.substring(0, 57) + '...'
		: task.description;
	const title = `[Beacon #${task.publicId}] ${titleDesc}`;

	const body = [
		`## Beacon Task #${task.publicId}`,
		'',
		`**Type:** ${task.type}`,
		`**Branch:** \`${branchName}\``,
		'',
		task.description,
		'',
		'---',
		'*Created automatically by svelte-beacon AI agent.*',
	].join('\n');

	try {
		const url = await execCommand('gh', [
			'pr', 'create',
			'--title', title,
			'--body', body,
		], cwd);
		return url || null;
	} catch {
		return null;
	}
}

/**
 * Orchestrate the full git workflow after the agent completes:
 * create branch, commit, push, and optionally create a PR.
 *
 * Returns the branch name and optional PR URL.
 * Git failures are caught and do not throw -- the caller receives
 * whatever partial results were achieved.
 */
export async function performGitOperations(
	task: { type: string; publicId: number; description: string },
	config: { createPR: boolean },
	cwd?: string,
): Promise<{ branch: string; prUrl: string | null }> {
	const branch = generateBranchName(task);
	let prUrl: string | null = null;

	try {
		await createBranch(branch, cwd);
		await commitChanges(`[Beacon #${task.publicId}] ${task.description}`, cwd);
		await pushBranch(branch, cwd);

		if (config.createPR) {
			prUrl = await createPR(branch, task, cwd);
		}
	} catch {
		// Git failure is non-fatal. Return whatever we have.
	}

	return { branch, prUrl };
}
