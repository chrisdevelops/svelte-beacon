/**
 * Layer 2: Agent prompt builder.
 *
 * Constructs the full prompt string for the Claude Code CLI subprocess.
 * The prompt includes task details, developer notes, project context,
 * mode-specific rules, structured marker instructions, and verification steps.
 *
 * This module does not import from Layer 1.
 */

import type { ProjectContext } from './context-generator.js';

export interface PromptInput {
	task: {
		type: string;
		priority: string;
		description: string;
		route: string | null;
		elementSelector: string | null;
		publicId: number;
	};
	adminNotes: string | null;
	context: ProjectContext;
	config: {
		requireTestsForBugs: boolean;
		createPR: boolean;
	};
}

/**
 * Maximum length for the branch slug portion (the kebab-case description).
 */
const MAX_SLUG_LENGTH = 40;

/**
 * Build the full agent prompt from structured input.
 *
 * The returned string is passed directly to the Claude Code CLI as the
 * prompt argument. It contains all the context the agent needs to
 * understand and implement the task.
 */
export function buildAgentPrompt(input: PromptInput): string {
	const sections: string[] = [];

	// 1. Role
	sections.push('You are implementing a task for a web application.');

	// 2. Task details
	sections.push(buildTaskSection(input.task));

	// 3. Admin notes (if provided)
	if (input.adminNotes) {
		sections.push(buildAdminNotesSection(input.adminNotes));
	}

	// 4. Project context
	sections.push(buildContextSection(input.context));

	// 5. Mode-specific rules
	sections.push(buildModeRulesSection(input.task.type, input.config.requireTestsForBugs));

	// 6. Structured markers
	sections.push(buildMarkersSection());

	// 7. Verification
	sections.push(buildVerificationSection(input.context.testFramework));

	// 8. Git instructions
	const slug = generateBranchSlug(input.task.description);
	sections.push(buildGitSection(input.task.type, input.task.publicId, slug, input.config.createPR));

	// 9. Important rules
	sections.push(buildRulesSection());

	return sections.join('\n\n');
}

/**
 * Generate a kebab-case branch slug from a task description.
 *
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, takes the first ~40 characters, and trims
 * trailing hyphens.
 */
export function generateBranchSlug(description: string): string {
	return description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/, '');
}

function buildTaskSection(task: PromptInput['task']): string {
	const lines: string[] = [
		'## Task',
		'',
		`**Type:** ${task.type}`,
		`**Priority:** ${task.priority}`,
		`**Description:** ${task.description}`,
	];

	if (task.route) {
		lines.push(`**Route:** ${task.route}`);
	}

	if (task.elementSelector) {
		lines.push(`**Element selector:** \`${task.elementSelector}\``);
	}

	return lines.join('\n');
}

function buildAdminNotesSection(notes: string): string {
	return `## Developer Notes\n\n${notes}`;
}

function buildContextSection(context: ProjectContext): string {
	const lines: string[] = ['## Project Context', ''];

	if (context.framework) {
		lines.push(`- **Framework:** ${context.framework}`);
	}
	lines.push(`- **Language:** ${context.language}`);
	if (context.testFramework) {
		lines.push(`- **Test framework:** ${context.testFramework}`);
	}
	lines.push(`- **Package manager:** ${context.packageManager}`);

	if (context.keyDependencies.length > 0) {
		lines.push(`- **Key dependencies:** ${context.keyDependencies.join(', ')}`);
	}

	if (context.projectStructure.length > 0) {
		lines.push(`- **Project structure:** ${context.projectStructure.join(', ')}`);
	}

	return lines.join('\n');
}

function buildModeRulesSection(taskType: string, requireTestsForBugs: boolean): string {
	const rules = getModeRules(taskType, requireTestsForBugs);
	return `## Mode Rules (${taskType})\n\n${rules}`;
}

function getModeRules(taskType: string, requireTestsForBugs: boolean): string {
	switch (taskType) {
		case 'bug': {
			const testRule = requireTestsForBugs
				? 'Write a failing test first that reproduces the bug, then fix it.'
				: 'If possible, write a test that reproduces the bug before fixing it.';
			return [
				testRule,
				'Find the root cause through analysis, not guessing.',
				'Apply the minimal fix that resolves the issue.',
				'Verify the fix does not introduce regressions.',
			].join('\n');
		}

		case 'feature':
			return [
				'Follow existing patterns in the codebase.',
				'Implement the minimum viable version first.',
				'Add tests for the new functionality.',
				'Do not refactor existing code unless necessary for the feature.',
			].join('\n');

		case 'performance':
			return [
				'Profile before and after. Include benchmark numbers.',
				'Apply targeted optimizations rather than broad rewrites.',
				'Document what changed and by how much.',
			].join('\n');

		case 'accessibility':
			return [
				'Follow WCAG 2.1 AA guidelines.',
				'Add ARIA attributes where needed.',
				'Ensure keyboard navigation works.',
				'Test with screen reader announcements in mind.',
			].join('\n');

		case 'content':
			return [
				'Make the precise text changes described, nothing more.',
				'Do not refactor surrounding code.',
				'Verify the content renders correctly.',
			].join('\n');

		default:
			return [
				'Follow existing patterns in the codebase.',
				'Keep changes focused and minimal.',
				'Add tests where applicable.',
			].join('\n');
	}
}

function buildMarkersSection(): string {
	return `## Progress Reporting

As you work, emit these structured markers on their own line so the dashboard can track your progress:

\`[BEACON:PROGRESS] {"phase": "<phase>", "message": "<status message>"}\`

Valid phases: starting, analyzing, planning, implementing, testing, verifying, committing.

If you need clarification from the developer, emit:

\`[BEACON:BLOCKED] {"question": "<your specific question>"}\`

Then STOP and wait for input on stdin.

When finished, emit:

\`[BEACON:COMPLETE] {"branch": "<branch name>", "prUrl": null, "summary": "<brief summary>"}\``;
}

function buildVerificationSection(testFramework: string | null): string {
	const steps: string[] = [
		'## Verification',
		'',
		'Before completing, run these checks and fix any issues:',
		'',
		'1. `npx tsc --noEmit` -- TypeScript must compile without errors',
	];

	if (testFramework === 'vitest') {
		steps.push('2. `npx vitest run` -- all tests must pass');
	} else if (testFramework === 'jest') {
		steps.push('2. `npx jest --passWithNoTests` -- all tests must pass');
	} else {
		steps.push('2. `npm test` -- all tests must pass (if a test runner is configured)');
	}

	steps.push('3. `npx eslint .` -- no linting errors (if eslint is configured)');

	return steps.join('\n');
}

function buildGitSection(
	taskType: string,
	publicId: number,
	slug: string,
	createPR: boolean,
): string {
	const branchName = `beacon/${taskType}-${publicId}-${slug}`;
	const lines: string[] = [
		'## Git',
		'',
		`Create a branch named \`${branchName}\` for your changes.`,
		'Commit your work with a clear, descriptive commit message.',
	];

	if (createPR) {
		lines.push('After pushing the branch, create a pull request with a summary of the changes.');
	}

	return lines.join('\n');
}

function buildRulesSection(): string {
	return `## Important Rules

- Never modify package.json dependencies without asking.
- Always use parameterized queries for database operations.
- Keep changes scoped to this task -- no unrelated modifications.
- If you are unsure about something, emit a BLOCKED marker and ask.`;
}
