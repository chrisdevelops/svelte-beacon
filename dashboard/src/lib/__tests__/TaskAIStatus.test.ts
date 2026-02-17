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

// Mock the api module
vi.mock('$lib/api.js', () => ({
	api: {
		startAI: vi.fn(),
		stopAI: vi.fn(),
		unblockAI: vi.fn(),
		getTask: vi.fn(),
	},
}));

import { api } from '$lib/api.js';
const mockStartAI = vi.mocked(api.startAI);
const mockGetTask = vi.mocked(api.getTask);

beforeEach(() => {
	MockEventSource.reset();
	vi.stubGlobal('EventSource', MockEventSource);
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
		// Should render Stop AI button (running state)
		const stopBtn = container.querySelector('[aria-label="Stop AI"]');
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
});
