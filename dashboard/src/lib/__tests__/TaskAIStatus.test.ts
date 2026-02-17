import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TaskAIStatus from '$lib/components/TaskAIStatus.svelte';
import { createMockTaskDetail, createMockAgentState } from './factories.js';

// Mock EventSource to prevent errors from AILogStream
class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onopen: (() => void) | null = null;
	onerror: (() => void) | null = null;
	listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
	readyState = 0;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}
	addEventListener(type: string, listener: (event: MessageEvent) => void): void {
		if (!this.listeners[type]) this.listeners[type] = [];
		this.listeners[type].push(listener);
	}
	removeEventListener(): void { /* noop */ }
	close(): void { this.readyState = 2; }

	// Test helper: simulate an event
	simulateEvent(type: string, data: string): void {
		const event = new MessageEvent(type, { data });
		for (const listener of this.listeners[type] ?? []) {
			listener(event);
		}
	}

	static reset(): void {
		MockEventSource.instances = [];
	}

	static getLatest(): MockEventSource | undefined {
		return MockEventSource.instances[MockEventSource.instances.length - 1];
	}
}

// Mock the api module — include APIError class (defined inline to avoid hoisting issues)
vi.mock('$lib/api.js', () => {
	class APIError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = 'APIError';
			this.status = status;
		}
	}
	return {
		api: {
			startAI: vi.fn(),
			stopAI: vi.fn(),
			unblockAI: vi.fn(),
			getTask: vi.fn(),
		},
		APIError,
	};
});

import { api, APIError } from '$lib/api.js';
const mockStartAI = vi.mocked(api.startAI);
const mockStopAI = vi.mocked(api.stopAI);
const mockGetTask = vi.mocked(api.getTask);

beforeEach(() => {
	MockEventSource.reset();
	vi.stubGlobal('EventSource', MockEventSource);
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve([]),
	}));
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
	// Mock HTMLDialogElement.showModal since jsdom doesn't support it
	HTMLDialogElement.prototype.showModal = vi.fn();
	HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('TaskAIStatus', () => {
	it('renders AIControls section', () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});
		// Should render the Controls heading
		expect(container.textContent).toContain('Controls');
		// Should render the Start AI button since status is backlog
		const startBtn = container.querySelector('[aria-label="Start AI"]');
		expect(startBtn).not.toBeNull();
	});

	it('renders AILogStream section', () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});
		// Should render the Logs heading
		expect(container.textContent).toContain('Logs');
		// Should show log container
		const logContainer = container.querySelector('.log-container');
		expect(logContainer).not.toBeNull();
	});

	it('shows error message on API failure', async () => {
		const task = createMockTaskDetail({ status: 'backlog' });
		mockStartAI.mockRejectedValueOnce(new Error('Network timeout'));

		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});

		// Click Start AI
		const startBtn = container.querySelector('[aria-label="Start AI"]') as HTMLButtonElement;
		startBtn.click();

		// Wait for error to appear
		await vi.waitFor(() => {
			const errorBanner = container.querySelector('[role="alert"]');
			expect(errorBanner).not.toBeNull();
			expect(errorBanner!.textContent).toContain('Network timeout');
		});
	});

	it('derives running status from ai_working task status', () => {
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});
		// Should render the Stop button in the running banner
		const stopBtn = container.querySelector('.stop-button');
		expect(stopBtn).not.toBeNull();
		// Should NOT render Start AI button
		const startBtn = container.querySelector('[aria-label="Start AI"]');
		expect(startBtn).toBeNull();
	});

	it('derives blocked status from blocked task status', () => {
		const task = createMockTaskDetail({
			status: 'blocked',
			ai_blocked_reason: 'Need clarification on API spec',
		});
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});
		// Should show blocked question from task
		expect(container.textContent).toContain('Need clarification on API spec');
		// Should show answer textarea
		const textarea = container.querySelector('[aria-label="Answer for AI"]');
		expect(textarea).not.toBeNull();
	});

	it('calls onupdated after successful AI start', async () => {
		const task = createMockTaskDetail({ id: 'task-123', status: 'backlog' });
		const updatedTask = createMockTaskDetail({ id: 'task-123', status: 'ai_working' });
		const onupdated = vi.fn();

		mockStartAI.mockResolvedValueOnce(createMockAgentState({
			status: 'running',
			taskId: 'task-123',
			phase: 'starting',
		}));
		mockGetTask.mockResolvedValueOnce(updatedTask);

		const { container } = render(TaskAIStatus, {
			props: { task, onupdated },
		});

		const startBtn = container.querySelector('[aria-label="Start AI"]') as HTMLButtonElement;
		startBtn.click();

		await vi.waitFor(() => {
			expect(mockStartAI).toHaveBeenCalledWith('task-123');
			expect(mockGetTask).toHaveBeenCalledWith('task-123');
			expect(onupdated).toHaveBeenCalledWith(updatedTask);
		});
	});

	it('passes activity messages from AILogStream to AIControls via lastActivity', async () => {
		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});

		// Get the EventSource created by AILogStream
		const es = MockEventSource.getLatest()!;
		expect(es).not.toBeUndefined();

		// Simulate an activity event through the SSE stream
		es.simulateEvent('activity', JSON.stringify({ message: 'Writing tests for api module' }));

		// The activity should propagate to AIControls as lastActivity
		await vi.waitFor(() => {
			const activityEl = container.querySelector('.last-activity');
			expect(activityEl).not.toBeNull();
			expect(activityEl!.textContent).toBe('Writing tests for api module');
		});
	});

	it('shows stall warning after 60s without activity', async () => {
		vi.useFakeTimers();

		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});

		const es = MockEventSource.getLatest()!;
		expect(es).not.toBeUndefined();

		// Simulate an initial activity event so lastActivityTime is set
		es.simulateEvent('activity', JSON.stringify({ message: 'Starting work' }));

		// Verify no stall warning initially
		await vi.waitFor(() => {
			const activityEl = container.querySelector('.last-activity');
			expect(activityEl).not.toBeNull();
		});
		expect(container.querySelector('.stall-warning')).toBeNull();

		// Advance time past the stall threshold (60s) + check interval (15s)
		vi.advanceTimersByTime(75_000);

		// The stall detection interval should have fired and set isStalled = true
		await vi.waitFor(() => {
			const stallWarning = container.querySelector('.stall-warning');
			expect(stallWarning).not.toBeNull();
			expect(stallWarning!.textContent).toContain('No activity for');
		});

		vi.useRealTimers();
	});

	it('clears stall warning when new activity arrives', async () => {
		vi.useFakeTimers();

		const task = createMockTaskDetail({ status: 'ai_working' });
		const { container } = render(TaskAIStatus, {
			props: { task, onupdated: vi.fn() },
		});

		const es = MockEventSource.getLatest()!;

		// Simulate initial activity then wait for stall
		es.simulateEvent('activity', JSON.stringify({ message: 'Initial work' }));

		// Advance past stall threshold
		vi.advanceTimersByTime(75_000);

		await vi.waitFor(() => {
			const stallWarning = container.querySelector('.stall-warning');
			expect(stallWarning).not.toBeNull();
		});

		// Now simulate new activity
		es.simulateEvent('activity', JSON.stringify({ message: 'Resumed work' }));

		// Stall warning should be cleared immediately
		await vi.waitFor(() => {
			const stallWarning = container.querySelector('.stall-warning');
			expect(stallWarning).toBeNull();
		});

		// And the new activity message should be displayed
		const activityEl = container.querySelector('.last-activity');
		expect(activityEl).not.toBeNull();
		expect(activityEl!.textContent).toBe('Resumed work');

		vi.useRealTimers();
	});

	it('recovers gracefully when stop returns 409', async () => {
		const task = createMockTaskDetail({ id: 'task-409', status: 'ai_working' });
		const refreshedTask = createMockTaskDetail({ id: 'task-409', status: 'backlog' });
		const onupdated = vi.fn();

		// stopAI throws 409 APIError (agent already gone)
		mockStopAI.mockRejectedValueOnce(new APIError(409, 'No active agent on this task'));
		// getTask returns refreshed task
		mockGetTask.mockResolvedValueOnce(refreshedTask);

		const { container } = render(TaskAIStatus, {
			props: { task, onupdated },
		});

		// Click the banner Stop button
		const stopBtn = container.querySelector('.stop-button') as HTMLButtonElement;
		expect(stopBtn).not.toBeNull();
		stopBtn.click();

		// Wait for the recovery to complete
		await vi.waitFor(() => {
			// Should NOT show error banner
			const errorBanner = container.querySelector('[role="alert"]');
			expect(errorBanner).toBeNull();
			// Should have re-fetched and called onupdated
			expect(mockGetTask).toHaveBeenCalledWith('task-409');
			expect(onupdated).toHaveBeenCalledWith(refreshedTask);
		});
	});
});
