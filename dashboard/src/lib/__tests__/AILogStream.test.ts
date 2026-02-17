import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import AILogStream from '$lib/components/AILogStream.svelte';
import type { AILogEntry } from '$lib/types.js';

// Mock EventSource
class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onopen: ((event: Event) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	listeners: Record<string, Array<(event: MessageEvent) => void>> = {};
	readyState = 0;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (event: MessageEvent) => void): void {
		if (!this.listeners[type]) {
			this.listeners[type] = [];
		}
		this.listeners[type].push(listener);
	}

	removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
		if (this.listeners[type]) {
			this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
		}
	}

	close(): void {
		this.readyState = 2;
	}

	// Test helper: simulate an event
	simulateEvent(type: string, data: string): void {
		const event = new MessageEvent(type, { data });
		for (const listener of this.listeners[type] ?? []) {
			listener(event);
		}
	}

	// Test helper: simulate open
	simulateOpen(): void {
		this.readyState = 1;
		if (this.onopen) {
			this.onopen(new Event('open'));
		}
	}

	// Test helper: simulate error
	simulateError(): void {
		if (this.onerror) {
			this.onerror(new Event('error'));
		}
	}

	static reset(): void {
		MockEventSource.instances = [];
	}

	static getLatest(): MockEventSource | undefined {
		return MockEventSource.instances[MockEventSource.instances.length - 1];
	}
}

function createMockFetch(logs: AILogEntry[] = []): typeof fetch {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: () => Promise.resolve(logs),
	}) as unknown as typeof fetch;
}

beforeEach(() => {
	MockEventSource.reset();
	vi.stubGlobal('EventSource', MockEventSource);
	vi.stubGlobal('fetch', createMockFetch());
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

describe('AILogStream', () => {
	it('renders empty log container when inactive and no historical logs', async () => {
		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: false },
		});

		// Wait for the fetch to resolve (returns empty array)
		await vi.waitFor(() => {
			expect(global.fetch).toHaveBeenCalled();
		});

		const logContainer = container.querySelector('.log-container');
		expect(logContainer).not.toBeNull();
		expect(container.textContent).toContain('No log entries');
	});

	it('shows Connecting when active and not yet connected', () => {
		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: true },
		});
		expect(container.textContent).toContain('Connecting...');
	});

	it('displays log entries with level badges', async () => {
		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: true },
		});

		const es = MockEventSource.getLatest()!;
		expect(es).not.toBeUndefined();
		expect(es.url).toBe('/__beacon/api/ai/logs/task-1');

		// Simulate a progress event
		es.simulateEvent('progress', JSON.stringify({ message: 'Analyzing codebase' }));

		// Wait for state update
		await vi.waitFor(() => {
			const entries = container.querySelectorAll('.log-entry');
			expect(entries.length).toBeGreaterThan(0);
		});

		const entry = container.querySelector('.log-entry')!;
		expect(entry.textContent).toContain('Analyzing codebase');
		const levelBadge = entry.querySelector('.log-level');
		expect(levelBadge).not.toBeNull();
		expect(levelBadge!.textContent).toContain('progress');
		expect(levelBadge!.classList.contains('level--progress')).toBe(true);
	});

	it('closes EventSource on cleanup', () => {
		const { unmount } = render(AILogStream, {
			props: { taskId: 'task-1', active: true },
		});

		const es = MockEventSource.getLatest()!;
		expect(es).not.toBeUndefined();
		expect(es.readyState).not.toBe(2);

		unmount();

		expect(es.readyState).toBe(2);
	});

	it('opens EventSource to correct URL', () => {
		render(AILogStream, {
			props: { taskId: 'my-task-id', active: true },
		});

		const es = MockEventSource.getLatest()!;
		expect(es.url).toBe('/__beacon/api/ai/logs/my-task-id');
	});

	it('handles multiple event types', async () => {
		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: true },
		});

		const es = MockEventSource.getLatest()!;

		es.simulateEvent('log', JSON.stringify({ level: 'info', message: 'Starting analysis' }));
		es.simulateEvent('progress', JSON.stringify({ message: 'Parsing files' }));
		es.simulateEvent('error', JSON.stringify({ message: 'Compilation failed' }));

		await vi.waitFor(() => {
			const entries = container.querySelectorAll('.log-entry');
			expect(entries.length).toBe(3);
		});

		const entries = container.querySelectorAll('.log-entry');
		expect(entries[0].textContent).toContain('Starting analysis');
		expect(entries[0].querySelector('.level--info')).not.toBeNull();
		expect(entries[1].textContent).toContain('Parsing files');
		expect(entries[1].querySelector('.level--progress')).not.toBeNull();
		expect(entries[2].textContent).toContain('Compilation failed');
		expect(entries[2].querySelector('.level--error')).not.toBeNull();
	});

	it('fetches historical logs via JSON when inactive', async () => {
		const historicalLogs: AILogEntry[] = [
			{
				id: 'log-1',
				task_id: 'task-1',
				level: 'info',
				message: 'Agent started',
				metadata: null,
				created_at: '2026-01-15T10:00:00.000Z',
			},
			{
				id: 'log-2',
				task_id: 'task-1',
				level: 'progress',
				message: 'Analyzing codebase',
				metadata: null,
				created_at: '2026-01-15T10:01:00.000Z',
			},
		];

		vi.stubGlobal('fetch', createMockFetch(historicalLogs));

		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: false },
		});

		await vi.waitFor(() => {
			const entries = container.querySelectorAll('.log-entry');
			expect(entries.length).toBe(2);
		});

		expect(global.fetch).toHaveBeenCalledWith(
			'/__beacon/api/ai/logs/task-1',
			{ headers: { 'Accept': 'application/json' } },
		);

		const entries = container.querySelectorAll('.log-entry');
		expect(entries[0].textContent).toContain('Agent started');
		expect(entries[1].textContent).toContain('Analyzing codebase');
	});

	it('uses server timestamp from SSE log events', async () => {
		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: true },
		});

		const es = MockEventSource.getLatest()!;

		// Send a log event with a server timestamp from 2 hours ago
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
		es.simulateEvent('progress', JSON.stringify({
			message: 'Old event',
			timestamp: twoHoursAgo,
		}));

		await vi.waitFor(() => {
			const entries = container.querySelectorAll('.log-entry');
			expect(entries.length).toBe(1);
		});

		const timeEl = container.querySelector('.log-time')!;
		// Should show "2h ago" rather than "just now"
		expect(timeEl.textContent).toContain('2h ago');
	});

	it('shows expand toggle for long messages', async () => {
		const longMessage = 'A'.repeat(250);

		const historicalLogs: AILogEntry[] = [
			{
				id: 'log-long',
				task_id: 'task-1',
				level: 'info',
				message: longMessage,
				metadata: null,
				created_at: '2026-01-15T10:00:00.000Z',
			},
		];

		vi.stubGlobal('fetch', createMockFetch(historicalLogs));

		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: false },
		});

		await vi.waitFor(() => {
			const entries = container.querySelectorAll('.log-entry');
			expect(entries.length).toBe(1);
		});

		// Should show "show more" button
		const toggle = container.querySelector('.expand-toggle');
		expect(toggle).not.toBeNull();
		expect(toggle!.textContent).toBe('show more');

		// The message should be truncated (not showing full 250 chars)
		const messageEl = container.querySelector('.log-message')!;
		expect(messageEl.textContent!.length).toBeLessThan(longMessage.length);
	});

	it('toggles expansion on click', async () => {
		const longMessage = 'B'.repeat(250);

		const historicalLogs: AILogEntry[] = [
			{
				id: 'log-expand',
				task_id: 'task-1',
				level: 'info',
				message: longMessage,
				metadata: null,
				created_at: '2026-01-15T10:00:00.000Z',
			},
		];

		vi.stubGlobal('fetch', createMockFetch(historicalLogs));

		const { container } = render(AILogStream, {
			props: { taskId: 'task-1', active: false },
		});

		await vi.waitFor(() => {
			const toggle = container.querySelector('.expand-toggle');
			expect(toggle).not.toBeNull();
		});

		// Click "show more"
		const toggle = container.querySelector('.expand-toggle') as HTMLButtonElement;
		toggle.click();

		await vi.waitFor(() => {
			const btn = container.querySelector('.expand-toggle');
			expect(btn).not.toBeNull();
			expect(btn!.textContent).toBe('show less');
		});

		// Full message should now be visible
		const messageEl = container.querySelector('.log-message')!;
		expect(messageEl.textContent).toContain(longMessage);

		// Click "show less"
		const collapseToggle = container.querySelector('.expand-toggle') as HTMLButtonElement;
		collapseToggle.click();

		await vi.waitFor(() => {
			const btn = container.querySelector('.expand-toggle');
			expect(btn).not.toBeNull();
			expect(btn!.textContent).toBe('show more');
		});
	});
});
