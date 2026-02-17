import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// --- Mock DB queries ---
vi.mock('../../../db/queries/tasks.js', () => ({
	getTask: vi.fn(),
}));
vi.mock('../../../db/queries/ai-logs.js', () => ({
	getAILogsByTaskId: vi.fn(),
}));

import { getTask } from '../../../db/queries/tasks.js';
import { getAILogsByTaskId } from '../../../db/queries/ai-logs.js';
import {
	createSSEStream,
	removeSSEConnection,
	broadcastToSSEClients,
	handleSSEConnection,
	_getConnectionCount,
	_clearConnectionsForTesting,
} from '../sse.js';
import type { Task } from '../../../types.js';
import type { ResolvedConfig } from '../../../config.js';
import type { AgentMarker } from '../types.js';

const mockGetTask = vi.mocked(getTask);
const mockGetAILogs = vi.mocked(getAILogsByTaskId);

const db = {} as unknown as import('@libsql/client').Client;

const testConfig: ResolvedConfig = {
	enabled: true,
	mode: 'development',
	database: 'file::memory:',
	requireAuth: false,
	adminEmails: [],
	widget: {
		screenshot: true,
		elementSelector: true,
		aiAssist: true,
		requireEmail: false,
		position: 'bottom-right',
	},
	ai: {
		maxDurationMinutes: 30,
		requireTestsForBugs: true,
		createPR: false,
	},
};

const mockTask: Task = {
	id: 'task-uuid-123',
	public_id: 42,
	type: 'bug',
	priority: 'high',
	status: 'backlog',
	description: 'Fix login button',
	route: '/login',
	element_selector: null,
	metadata: null,
	origin: 'widget',
	remote_id: null,
	ai_branch: null,
	ai_pr_url: null,
	ai_blocked_reason: null,
	user_email: null,
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
};

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

function createMockEvent(accept: string = 'text/event-stream'): RequestEvent {
	const url = new URL('http://localhost/__beacon/api/ai/logs/task-uuid-123');
	return {
		url,
		request: new Request(url, {
			headers: { 'Accept': accept },
		}),
		params: {},
		route: { id: null },
		locals: {},
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	_clearConnectionsForTesting();
});

afterEach(() => {
	_clearConnectionsForTesting();
});

describe('createSSEStream', () => {
	it('returns a Response with correct headers', () => {
		const { response } = createSSEStream('task-uuid-123');

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		expect(response.headers.get('Connection')).toBe('keep-alive');
	});

	it('returns a unique connection ID', () => {
		const { connectionId: id1 } = createSSEStream('task-uuid-123');
		const { connectionId: id2 } = createSSEStream('task-uuid-123');

		expect(id1).toBeTruthy();
		expect(id2).toBeTruthy();
		expect(id1).not.toBe(id2);
	});

	it('registers the connection', () => {
		const before = _getConnectionCount();
		createSSEStream('task-uuid-123');
		const after = _getConnectionCount();

		expect(after).toBe(before + 1);
	});
});

describe('removeSSEConnection', () => {
	it('removes an existing connection', () => {
		const { connectionId } = createSSEStream('task-uuid-123');
		const before = _getConnectionCount();

		removeSSEConnection(connectionId);

		expect(_getConnectionCount()).toBe(before - 1);
	});

	it('is safe to call with non-existent ID', () => {
		expect(() => removeSSEConnection('nonexistent-id')).not.toThrow();
	});
});

describe('broadcastToSSEClients', () => {
	it('does not throw when there are no connections', () => {
		const marker: AgentMarker = {
			type: 'progress',
			phase: 'analyzing',
			message: 'Reading codebase',
		};

		expect(() => broadcastToSSEClients('task-uuid-123', marker)).not.toThrow();
	});

	it('does not send to connections for different tasks', () => {
		// Create a connection for a different task
		createSSEStream('different-task-id');

		const marker: AgentMarker = {
			type: 'progress',
			phase: 'analyzing',
			message: 'Reading codebase',
		};

		// Should not throw even though no connections match
		expect(() => broadcastToSSEClients('task-uuid-123', marker)).not.toThrow();
	});

	it('handles all marker types without error', () => {
		createSSEStream('task-uuid-123');

		const markers: AgentMarker[] = [
			{ type: 'progress', phase: 'analyzing', message: 'Reading codebase' },
			{ type: 'blocked', question: 'Which table?' },
			{ type: 'complete', branch: 'beacon/bug-42-fix', prUrl: null, summary: 'Fixed it' },
			{ type: 'error', message: 'Something went wrong' },
		];

		for (const marker of markers) {
			expect(() => broadcastToSSEClients('task-uuid-123', marker)).not.toThrow();
		}
	});
});

describe('handleSSEConnection', () => {
	it('returns 400 when task ID is missing', async () => {
		const event = createMockEvent();

		const response = await handleSSEConnection(event, db, testConfig, {});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Task ID required');
	});

	it('returns 404 when task not found', async () => {
		mockGetTask.mockResolvedValue(null);
		const event = createMockEvent();

		const response = await handleSSEConnection(event, db, testConfig, { id: 'nonexistent' });
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('returns SSE stream when Accept header includes text/event-stream', async () => {
		mockGetTask.mockResolvedValue(mockTask);
		mockGetAILogs.mockResolvedValue([]);

		const event = createMockEvent('text/event-stream');

		const response = await handleSSEConnection(event, db, testConfig, { id: 'task-uuid-123' });

		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	});

	it('returns JSON logs when Accept header does not include text/event-stream', async () => {
		mockGetTask.mockResolvedValue(mockTask);
		const mockLogs = [
			{
				id: 'log-1',
				task_id: 'task-uuid-123',
				level: 'info',
				message: 'Started',
				metadata: null,
				created_at: '2026-01-01T00:00:00.000Z',
			},
		];
		mockGetAILogs.mockResolvedValue(mockLogs);

		const event = createMockEvent('application/json');

		const response = await handleSSEConnection(event, db, testConfig, { id: 'task-uuid-123' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(body).toHaveLength(1);
		expect(body[0].message).toBe('Started');
	});

	it('fetches logs for catch-up on SSE connection', async () => {
		mockGetTask.mockResolvedValue(mockTask);
		mockGetAILogs.mockResolvedValue([]);

		const event = createMockEvent('text/event-stream');

		await handleSSEConnection(event, db, testConfig, { id: 'task-uuid-123' });

		expect(mockGetAILogs).toHaveBeenCalledWith(db, 'task-uuid-123');
	});
});
