import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import AIControls from '$lib/components/AIControls.svelte';
import { createMockTaskDetail } from './factories.js';
import type { TaskDetail } from '$lib/types.js';

beforeEach(() => {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('AIControls', () => {
	it('renders Start AI button when idle and task in backlog', () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'idle',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const startBtn = container.querySelector('[aria-label="Start AI"]') as HTMLButtonElement;
		expect(startBtn).not.toBeNull();
		expect(startBtn.textContent).toContain('Start AI');
		expect(startBtn.disabled).toBe(false);
	});

	it('disables start button when agentBusy is true', () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'idle',
				agentPhase: null,
				agentBusy: true,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const startBtn = container.querySelector('[aria-label="Start AI"]') as HTMLButtonElement;
		expect(startBtn).not.toBeNull();
		expect(startBtn.disabled).toBe(true);
		expect(startBtn.textContent).toContain('Agent busy');
	});

	it('renders Stop AI button when running', () => {
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'running',
				agentPhase: 'implementing',
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const stopBtn = container.querySelector('[aria-label="Stop AI"]') as HTMLButtonElement;
		expect(stopBtn).not.toBeNull();
		expect(stopBtn.textContent).toContain('Stop AI');
		// Should show phase badge
		const phaseBadge = container.querySelector('.phase-badge');
		expect(phaseBadge).not.toBeNull();
		expect(phaseBadge!.textContent).toContain('Implementing');
	});

	it('renders question and answer textarea when blocked', () => {
		const task = createMockTaskDetail({ status: 'blocked' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'blocked',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: 'Which database should I use?',
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		expect(container.textContent).toContain('Which database should I use?');
		const textarea = container.querySelector('[aria-label="Answer for AI"]') as HTMLTextAreaElement;
		expect(textarea).not.toBeNull();
		const resumeBtn = container.querySelector('[aria-label="Resume AI"]') as HTMLButtonElement;
		expect(resumeBtn).not.toBeNull();
		expect(resumeBtn.textContent).toContain('Resume');
	});

	it('calls onstart when Start AI button is clicked', async () => {
		const onstart = vi.fn();
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'idle',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart,
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const startBtn = container.querySelector('[aria-label="Start AI"]') as HTMLButtonElement;
		startBtn.click();
		expect(onstart).toHaveBeenCalled();
	});

	it('calls onstop when Stop AI button is clicked', () => {
		const onstop = vi.fn();
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'running',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop,
				onunblock: vi.fn(),
			},
		});
		const stopBtn = container.querySelector('[aria-label="Stop AI"]') as HTMLButtonElement;
		stopBtn.click();
		expect(onstop).toHaveBeenCalled();
	});

	it('calls onunblock with answer when Resume is clicked', async () => {
		const onunblock = vi.fn();
		const task = createMockTaskDetail({ status: 'blocked' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'blocked',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: 'Which approach?',
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock,
			},
		});
		const textarea = container.querySelector('[aria-label="Answer for AI"]') as HTMLTextAreaElement;
		await fireEvent.input(textarea, { target: { value: 'Use PostgreSQL' } });

		const resumeBtn = container.querySelector('[aria-label="Resume AI"]') as HTMLButtonElement;
		resumeBtn.click();
		expect(onunblock).toHaveBeenCalledWith('Use PostgreSQL');
	});

	it('shows completed state with branch and PR link', () => {
		const task = createMockTaskDetail({
			status: 'done',
			ai_branch: 'fix/login-bug',
			ai_pr_url: 'https://github.com/org/repo/pull/42',
		});
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'completed',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		expect(container.textContent).toContain('AI completed successfully');
		expect(container.textContent).toContain('fix/login-bug');
		const prLink = container.querySelector('.result-link') as HTMLAnchorElement;
		expect(prLink).not.toBeNull();
		expect(prLink.href).toBe('https://github.com/org/repo/pull/42');
	});

	it('shows failed state with Retry button', () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'failed',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		expect(container.textContent).toContain('AI execution failed');
		const retryBtn = container.querySelector('[aria-label="Retry AI"]') as HTMLButtonElement;
		expect(retryBtn).not.toBeNull();
		expect(retryBtn.textContent).toContain('Retry');
	});

	it('shows info message when task is not in backlog', () => {
		const task = createMockTaskDetail({ status: 'new' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'idle',
				agentPhase: null,
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		expect(container.textContent).toContain('Move task to backlog');
	});

	it('renders lastActivity text when provided and agent is running', () => {
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'running',
				agentPhase: 'implementing',
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				lastActivity: 'Reading src/server/api/tasks.ts',
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const activityEl = container.querySelector('.last-activity');
		expect(activityEl).not.toBeNull();
		expect(activityEl!.textContent).toBe('Reading src/server/api/tasks.ts');
		expect(activityEl!.getAttribute('title')).toBe('Reading src/server/api/tasks.ts');
	});

	it('does not render lastActivity when null', () => {
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(AIControls, {
			props: {
				task,
				agentStatus: 'running',
				agentPhase: 'implementing',
				agentBusy: false,
				blockedQuestion: null,
				loading: false,
				lastActivity: null,
				onstart: vi.fn(),
				onstop: vi.fn(),
				onunblock: vi.fn(),
			},
		});
		const activityEl = container.querySelector('.last-activity');
		expect(activityEl).toBeNull();
	});
});
