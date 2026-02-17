import { describe, it, expect } from 'vitest';
import { buildAgentPrompt, generateBranchSlug } from '../prompt-builder.js';
import type { PromptInput } from '../prompt-builder.js';
import type { ProjectContext } from '../context-generator.js';

function makeContext(overrides: Partial<ProjectContext> = {}): ProjectContext {
	return {
		framework: 'sveltekit',
		language: 'typescript',
		testFramework: 'vitest',
		packageManager: 'npm',
		keyDependencies: ['svelte', '@sveltejs/kit', 'vitest'],
		projectStructure: ['src', 'tests'],
		...overrides,
	};
}

function makeInput(overrides: Partial<PromptInput> = {}): PromptInput {
	return {
		task: {
			type: 'bug',
			priority: 'high',
			description: 'Login button does not respond to clicks',
			route: '/auth/login',
			elementSelector: '#login-btn',
			publicId: 42,
		},
		adminNotes: null,
		context: makeContext(),
		config: {
			requireTestsForBugs: true,
			createPR: false,
		},
		...overrides,
	};
}

describe('buildAgentPrompt', () => {
	it('includes task description in prompt', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('Login button does not respond to clicks');
	});

	it('includes admin notes when provided', () => {
		const prompt = buildAgentPrompt(makeInput({
			adminNotes: 'Check the event handler binding on the form component.',
		}));

		expect(prompt).toContain('## Developer Notes');
		expect(prompt).toContain('Check the event handler binding on the form component.');
	});

	it('omits admin notes section when null', () => {
		const prompt = buildAgentPrompt(makeInput({ adminNotes: null }));

		expect(prompt).not.toContain('## Developer Notes');
	});

	it('includes route when provided', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('/auth/login');
	});

	it('omits route line when null', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'bug',
				priority: 'high',
				description: 'Something is broken',
				route: null,
				elementSelector: null,
				publicId: 1,
			},
		}));

		expect(prompt).not.toContain('**Route:**');
	});

	it('includes element selector when provided', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('`#login-btn`');
	});

	it('omits element selector line when null', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'feature',
				priority: 'medium',
				description: 'Add dark mode toggle',
				route: null,
				elementSelector: null,
				publicId: 5,
			},
		}));

		expect(prompt).not.toContain('**Element selector:**');
	});

	it('bug type includes failing test first instruction', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'bug',
				priority: 'high',
				description: 'Form validation fails silently',
				route: null,
				elementSelector: null,
				publicId: 10,
			},
			config: { requireTestsForBugs: true, createPR: false },
		}));

		expect(prompt).toContain('Write a failing test first that reproduces the bug');
	});

	it('bug type without requireTestsForBugs uses softer test language', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'bug',
				priority: 'high',
				description: 'Form validation fails silently',
				route: null,
				elementSelector: null,
				publicId: 10,
			},
			config: { requireTestsForBugs: false, createPR: false },
		}));

		expect(prompt).toContain('If possible, write a test');
		expect(prompt).not.toContain('Write a failing test first');
	});

	it('feature type includes follow existing patterns', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'feature',
				priority: 'medium',
				description: 'Add dark mode support',
				route: null,
				elementSelector: null,
				publicId: 7,
			},
		}));

		expect(prompt).toContain('Follow existing patterns in the codebase');
	});

	it('performance type includes profiling instructions', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'performance',
				priority: 'medium',
				description: 'Dashboard loads slowly',
				route: null,
				elementSelector: null,
				publicId: 15,
			},
		}));

		expect(prompt).toContain('Profile before and after');
		expect(prompt).toContain('benchmark numbers');
	});

	it('accessibility type includes WCAG guidelines', () => {
		const prompt = buildAgentPrompt(makeInput({
			task: {
				type: 'accessibility',
				priority: 'high',
				description: 'Missing alt text on images',
				route: null,
				elementSelector: null,
				publicId: 20,
			},
		}));

		expect(prompt).toContain('WCAG 2.1 AA');
	});

	it('includes BEACON marker instructions', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('[BEACON:PROGRESS]');
		expect(prompt).toContain('[BEACON:BLOCKED]');
		expect(prompt).toContain('[BEACON:COMPLETE]');
	});

	it('includes verification steps', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('npx tsc --noEmit');
		expect(prompt).toContain('npx vitest run');
		expect(prompt).toContain('npx eslint');
	});

	it('uses jest in verification when test framework is jest', () => {
		const prompt = buildAgentPrompt(makeInput({
			context: makeContext({ testFramework: 'jest' }),
		}));

		expect(prompt).toContain('npx jest');
		expect(prompt).not.toContain('npx vitest');
	});

	it('uses generic npm test when no test framework detected', () => {
		const prompt = buildAgentPrompt(makeInput({
			context: makeContext({ testFramework: null }),
		}));

		expect(prompt).toContain('npm test');
	});

	it('generates correct branch name with slug', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('beacon/bug-42-login-button-does-not-respond-to-cl');
	});

	it('includes project context details', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('sveltekit');
		expect(prompt).toContain('typescript');
		expect(prompt).toContain('vitest');
	});

	it('includes important rules section', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('Never modify package.json dependencies without asking');
		expect(prompt).toContain('parameterized queries');
	});

	it('includes PR instructions when createPR is true', () => {
		const prompt = buildAgentPrompt(makeInput({
			config: { requireTestsForBugs: true, createPR: true },
		}));

		expect(prompt).toContain('create a pull request');
	});

	it('omits PR instructions when createPR is false', () => {
		const prompt = buildAgentPrompt(makeInput({
			config: { requireTestsForBugs: true, createPR: false },
		}));

		expect(prompt).not.toContain('create a pull request');
	});

	it('includes role statement', () => {
		const prompt = buildAgentPrompt(makeInput());

		expect(prompt).toContain('You are implementing a task for a web application');
	});
});

describe('generateBranchSlug', () => {
	it('converts description to kebab-case', () => {
		expect(generateBranchSlug('Login button is broken')).toBe('login-button-is-broken');
	});

	it('truncates long descriptions to ~40 characters', () => {
		const slug = generateBranchSlug(
			'This is a very long description that should be truncated to a reasonable length',
		);
		expect(slug.length).toBeLessThanOrEqual(40);
		expect(slug.endsWith('-')).toBe(false);
	});

	it('handles special characters', () => {
		const slug = generateBranchSlug('Fix the @#$% button!!!');
		expect(slug).toBe('fix-the-button');
		expect(slug).not.toContain('@');
		expect(slug).not.toContain('#');
		expect(slug).not.toContain('!');
	});

	it('trims leading and trailing hyphens', () => {
		const slug = generateBranchSlug('---hello world---');
		expect(slug).toBe('hello-world');
	});

	it('collapses consecutive hyphens', () => {
		const slug = generateBranchSlug('foo   bar   baz');
		expect(slug).toBe('foo-bar-baz');
	});

	it('handles empty string', () => {
		const slug = generateBranchSlug('');
		expect(slug).toBe('');
	});

	it('handles string of only special characters', () => {
		const slug = generateBranchSlug('!@#$%^&*()');
		expect(slug).toBe('');
	});
});
