import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Client } from '@libsql/client';
import type { RequestEvent } from '@sveltejs/kit';
import type { ResolvedConfig } from '../../config.js';
import type { AgentState } from '../../ai/layer2/types.js';
import { defaultConfig } from '../../../../test/mocks/factories.js';

// --- Mocks ---

vi.mock('../../ai/layer2/agent.js', () => ({
	startAgent: vi.fn(),
	stopAgent: vi.fn(),
	unblockAgent: vi.fn(),
	getActiveAgent: vi.fn(),
	isClaudeAvailable: vi.fn(),
}));

vi.mock('../../ai/layer2/sse.js', () => ({
	handleSSEConnection: vi.fn(),
}));

vi.mock('../../db/queries/tasks.js', () => ({
	getTask: vi.fn(),
}));

vi.mock('../../db/queries/activity.js', () => ({
	createActivity: vi.fn(),
}));

// Must import after vi.mock declarations
import {
	handleStartAI,
	handleStopAI,
	handleUnblockAI,
	handleAILogs,
} from '../ai-agent.js';
import { startAgent, stopAgent, unblockAgent, getActiveAgent } from '../../ai/layer2/agent.js';
import { handleSSEConnection } from '../../ai/layer2/sse.js';
import { getTask } from '../../db/queries/tasks.js';
import { createActivity } from '../../db/queries/activity.js';

const mockStartAgent = vi.mocked(startAgent);
const mockStopAgent = vi.mocked(stopAgent);
const mockUnblockAgent = vi.mocked(unblockAgent);
const mockGetActiveAgent = vi.mocked(getActiveAgent);
const mockHandleSSEConnection = vi.mocked(handleSSEConnection);
const mockGetTask = vi.mocked(getTask);
const mockCreateActivity = vi.mocked(createActivity);

// --- Helpers ---

const mockDb = {} as Client;
const config: ResolvedConfig = { ...defaultConfig };

const TASK_ID = 'task-abc-123';

function createMockEvent(method: string, body?: unknown): RequestEvent {
	const url = new URL(`http://localhost/__beacon/api/ai/start/${TASK_ID}`);
	const headers: Record<string, string> = {};
	if (body) {
		headers['Content-Type'] = 'application/json';
	}
	const request = new Request(url, {
		method,
		body: body ? JSON.stringify(body) : undefined,
		headers,
	});
	return {
		request,
		url,
		params: {},
		route: { id: null },
		locals: {},
		cookies: {
			get: () => null,
			getAll: () => [],
			set: () => {},
			delete: () => {},
			serialize: () => '',
		},
		getClientAddress: () => '127.0.0.1',
		setHeaders: () => {},
		fetch: globalThis.fetch,
		isDataRequest: false,
		isSubRequest: false,
		platform: undefined,
	} as unknown as RequestEvent;
}

const runningState: AgentState = {
	status: 'running',
	taskId: TASK_ID,
	phase: 'starting',
	startedAt: new Date().toISOString(),
	lastMessage: null,
	blockedQuestion: null,
};

const idleState: AgentState = {
	status: 'idle',
	taskId: null,
	phase: null,
	startedAt: null,
	lastMessage: null,
	blockedQuestion: null,
};

const blockedState: AgentState = {
	status: 'blocked',
	taskId: TASK_ID,
	phase: 'implementing',
	startedAt: new Date().toISOString(),
	lastMessage: null,
	blockedQuestion: 'Which database table should I use?',
};

const params = { id: TASK_ID };

// --- Tests ---

beforeEach(() => {
	vi.clearAllMocks();
	mockGetTask.mockResolvedValue(null);
	mockGetActiveAgent.mockReturnValue(idleState);
	mockCreateActivity.mockResolvedValue({
		id: 'activity-1',
		task_id: TASK_ID,
		actor: 'user',
		action: 'ai_unblock',
		old_value: null,
		new_value: 'test answer',
		created_at: new Date().toISOString(),
	});
});

describe('POST /ai/start/:id', () => {
	it('returns 404 when task not found', async () => {
		mockGetTask.mockResolvedValue(null);

		const event = createMockEvent('POST');
		const response = await handleStartAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('Task not found');
	});

	it('returns 409 when agent already active', async () => {
		mockGetTask.mockResolvedValue({ id: TASK_ID } as ReturnType<typeof getTask> extends Promise<infer T> ? NonNullable<T> : never);
		mockStartAgent.mockRejectedValue(new Error('Agent is already active'));

		const event = createMockEvent('POST');
		const response = await handleStartAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toBe('Agent is busy');
	});

	it('returns 503 when Claude CLI not installed', async () => {
		mockGetTask.mockResolvedValue({ id: TASK_ID } as ReturnType<typeof getTask> extends Promise<infer T> ? NonNullable<T> : never);
		mockStartAgent.mockRejectedValue(new Error('Claude CLI not installed'));

		const event = createMockEvent('POST');
		const response = await handleStartAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error).toBe('Claude CLI is not installed on the server');
	});

	it('returns 202 on success', async () => {
		mockGetTask.mockResolvedValue({ id: TASK_ID } as ReturnType<typeof getTask> extends Promise<infer T> ? NonNullable<T> : never);
		mockStartAgent.mockResolvedValue(runningState);

		const event = createMockEvent('POST');
		const response = await handleStartAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(202);
		expect(body.status).toBe('running');
		expect(body.taskId).toBe(TASK_ID);
	});

	it('returns 500 for unexpected errors', async () => {
		mockGetTask.mockResolvedValue({ id: TASK_ID } as ReturnType<typeof getTask> extends Promise<infer T> ? NonNullable<T> : never);
		mockStartAgent.mockRejectedValue(new Error('Something unexpected'));

		const event = createMockEvent('POST');
		const response = await handleStartAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('Failed to start agent');
	});
});

describe('POST /ai/stop/:id', () => {
	it('returns 409 when no active agent on task', async () => {
		mockGetActiveAgent.mockReturnValue(idleState);

		const event = createMockEvent('POST');
		const response = await handleStopAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toBe('No active agent on this task');
	});

	it('returns 409 when agent is active on a different task', async () => {
		mockGetActiveAgent.mockReturnValue({
			...runningState,
			taskId: 'other-task-id',
		});

		const event = createMockEvent('POST');
		const response = await handleStopAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toBe('No active agent on this task');
	});

	it('returns 200 on success', async () => {
		mockGetActiveAgent.mockReturnValue(runningState);
		mockStopAgent.mockResolvedValue(idleState);

		const event = createMockEvent('POST');
		const response = await handleStopAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe('idle');
	});
});

describe('POST /ai/unblock/:id', () => {
	it('returns 400 when answer is missing', async () => {
		const event = createMockEvent('POST', { something: 'else' });
		const response = await handleUnblockAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Answer is required');
	});

	it('returns 400 when answer is empty string', async () => {
		const event = createMockEvent('POST', { answer: '   ' });
		const response = await handleUnblockAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Answer is required');
	});

	it('returns 409 when no active agent on this task', async () => {
		mockGetActiveAgent.mockReturnValue(idleState);

		const event = createMockEvent('POST', { answer: 'Use the users table' });
		const response = await handleUnblockAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toBe('No active agent on this task');
	});

	it('returns 409 when agent is not blocked', async () => {
		mockGetActiveAgent.mockReturnValue(runningState);
		mockUnblockAgent.mockRejectedValue(new Error('Agent is not blocked'));

		const event = createMockEvent('POST', { answer: 'Use the users table' });
		const response = await handleUnblockAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toBe('Agent is not blocked');
	});

	it('returns 200 on success', async () => {
		mockGetActiveAgent.mockReturnValue(blockedState);
		mockUnblockAgent.mockResolvedValue(runningState);

		const event = createMockEvent('POST', { answer: 'Use the users table' });
		const response = await handleUnblockAI(event, mockDb, config, params);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.status).toBe('running');
	});

	it('creates activity log on successful unblock', async () => {
		mockGetActiveAgent.mockReturnValue(blockedState);
		mockUnblockAgent.mockResolvedValue(runningState);

		const event = createMockEvent('POST', { answer: 'Use the users table' });
		await handleUnblockAI(event, mockDb, config, params);

		// Allow fire-and-forget promise to settle
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(mockCreateActivity).toHaveBeenCalledWith(mockDb, {
			task_id: TASK_ID,
			actor: 'user',
			action: 'ai_unblock',
			new_value: 'Use the users table',
		});
	});
});

describe('GET /ai/logs/:id', () => {
	it('delegates to handleSSEConnection', async () => {
		const mockResponse = new Response('stream', { status: 200 });
		mockHandleSSEConnection.mockResolvedValue(mockResponse);

		const event = createMockEvent('GET');
		const response = await handleAILogs(event, mockDb, config, params);

		expect(mockHandleSSEConnection).toHaveBeenCalledWith(event, mockDb, config, params);
		expect(response).toBe(mockResponse);
	});
});
