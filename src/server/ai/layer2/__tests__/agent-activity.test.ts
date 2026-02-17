/**
 * Tests for throttled activity event persistence in the agent module.
 *
 * These tests verify that:
 * 1. Activity events are persisted to ai_logs with level 'activity'
 * 2. Activity DB writes are throttled (max 1 per 2 seconds)
 * 3. Activity DB writes resume after throttle window expires
 * 4. SSE broadcast still happens even when DB write is throttled
 * 5. resetState clears the throttle timer
 * 6. lastMessage is updated with activity text
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

// --- Mock child_process ---
vi.mock('node:child_process', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn: vi.fn(),
	execFile: vi.fn(),
}));

// --- Mock readline ---
vi.mock('node:readline', async (importOriginal) => ({
	...(await importOriginal<typeof import('node:readline')>()),
	createInterface: vi.fn(),
}));

// --- Mock DB queries ---
vi.mock('../../../db/queries/tasks.js', () => ({
	getTask: vi.fn(),
	updateTask: vi.fn(),
	updateTaskAIFields: vi.fn(),
}));
vi.mock('../../../db/queries/activity.js', () => ({
	createActivity: vi.fn(),
}));
vi.mock('../../../db/queries/ai-logs.js', () => ({
	createAILog: vi.fn(),
	getAILogsByTaskId: vi.fn(),
}));

// --- Mock context-generator and prompt-builder ---
vi.mock('../context-generator.js', () => ({
	generateProjectContext: vi.fn(),
}));
vi.mock('../prompt-builder.js', () => ({
	buildAgentPrompt: vi.fn(),
}));

// --- Mock SSE ---
vi.mock('../sse.js', () => ({
	broadcastToSSEClients: vi.fn(),
}));

// --- Mock output-parser ---
vi.mock('../output-parser.js', () => ({
	parseStreamLine: vi.fn(),
	parseStreamActivity: vi.fn(),
}));

import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import { getTask, updateTask, updateTaskAIFields } from '../../../db/queries/tasks.js';
import { createActivity } from '../../../db/queries/activity.js';
import { createAILog } from '../../../db/queries/ai-logs.js';
import { generateProjectContext } from '../context-generator.js';
import { buildAgentPrompt } from '../prompt-builder.js';
import { broadcastToSSEClients } from '../sse.js';
import { parseStreamLine, parseStreamActivity } from '../output-parser.js';
import {
	getActiveAgent,
	startAgent,
	stopAgent,
	_resetForTesting,
} from '../agent.js';
import type { ResolvedConfig } from '../../../config.js';
import type { Task } from '../../../types.js';

// --- Typed mocks ---
const mockSpawn = vi.mocked(spawn);
const mockExecFile = vi.mocked(execFile);
const mockCreateInterface = vi.mocked(createInterface);
const mockGetTask = vi.mocked(getTask);
const mockUpdateTask = vi.mocked(updateTask);
const mockUpdateTaskAIFields = vi.mocked(updateTaskAIFields);
const mockCreateActivity = vi.mocked(createActivity);
const mockCreateAILog = vi.mocked(createAILog);
const mockGenerateProjectContext = vi.mocked(generateProjectContext);
const mockBuildAgentPrompt = vi.mocked(buildAgentPrompt);
const mockBroadcast = vi.mocked(broadcastToSSEClients);
const mockParseStreamLine = vi.mocked(parseStreamLine);
const mockParseStreamActivity = vi.mocked(parseStreamActivity);

// --- Test helpers ---

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

function createMockProcess(): ChildProcess & { stdout: EventEmitter; stderr: EventEmitter } {
	const stdout = new EventEmitter();
	const stderr = new EventEmitter();
	const proc = Object.assign(new EventEmitter(), {
		stdout,
		stderr,
		stdin: { write: vi.fn(), end: vi.fn() },
		kill: vi.fn(),
		pid: 12345,
		connected: true,
		exitCode: null,
		signalCode: null,
		spawnargs: [] as string[],
		spawnfile: '',
		killed: false,
		ref: vi.fn().mockReturnThis(),
		unref: vi.fn().mockReturnThis(),
		disconnect: vi.fn(),
		send: vi.fn(),
		stdio: [null, stdout, stderr, null, null] as ChildProcess['stdio'],
		[Symbol.dispose]: vi.fn(),
	}) as unknown as ChildProcess & {
		stdout: EventEmitter;
		stderr: EventEmitter;
	};
	return proc;
}

const mockTask: Task = {
	id: 'task-uuid-123',
	public_id: 42,
	type: 'bug',
	priority: 'high',
	status: 'backlog',
	description: 'Fix login button on mobile',
	route: '/login',
	element_selector: '.btn-login',
	metadata: null,
	origin: 'widget',
	remote_id: null,
	ai_branch: null,
	ai_pr_url: null,
	ai_blocked_reason: null,
	user_email: 'user@test.com',
	created_at: '2026-01-01T00:00:00.000Z',
	updated_at: '2026-01-01T00:00:00.000Z',
};

const testConfig: ResolvedConfig = {
	enabled: true,
	mode: 'development',
	database: 'file::memory:',
	requireAuth: false,
	adminEmails: ['admin@test.com'],
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

const db = {} as unknown as import('@libsql/client').Client;

/**
 * Sets up the mock readline and returns functions to emit lines to stdout or stderr.
 * Captures both the stdout and stderr 'line' callbacks separately.
 *
 * The spawn function creates two readline interfaces:
 *   1st call: createInterface({ input: proc.stdout }) -- for marker/activity parsing
 *   2nd call: createInterface({ input: proc.stderr }) -- for stderr error logging
 */
function setupMockReadline(proc: ReturnType<typeof createMockProcess>): {
	emitStdoutLine: (line: string) => void;
	emitStderrLine: (line: string) => void;
} {
	const state: {
		stdoutCallback: ((line: string) => void) | null;
		stderrCallback: ((line: string) => void) | null;
	} = { stdoutCallback: null, stderrCallback: null };

	mockCreateInterface.mockImplementation((opts: unknown) => {
		const options = opts as { input: EventEmitter };
		const isStdout = options.input === proc.stdout;

		return {
			on: vi.fn((event: string, cb: (line: string) => void) => {
				if (event === 'line') {
					if (isStdout) {
						state.stdoutCallback = cb;
					} else {
						state.stderrCallback = cb;
					}
				}
				return { on: vi.fn() };
			}),
			close: vi.fn(),
		} as unknown as ReturnType<typeof createInterface>;
	});

	return {
		emitStdoutLine(line: string): void {
			if (state.stdoutCallback) {
				state.stdoutCallback(line);
			}
		},
		emitStderrLine(line: string): void {
			if (state.stderrCallback) {
				state.stderrCallback(line);
			}
		},
	};
}

function setupDefaultMocks(): {
	proc: ReturnType<typeof createMockProcess>;
	emitStdoutLine: (line: string) => void;
	emitStderrLine: (line: string) => void;
} {
	const proc = createMockProcess();
	const { emitStdoutLine, emitStderrLine } = setupMockReadline(proc);

	mockSpawn.mockReturnValue(proc as unknown as ChildProcess);

	mockGetTask.mockResolvedValue(mockTask);
	mockUpdateTask.mockResolvedValue(mockTask);
	mockUpdateTaskAIFields.mockResolvedValue(mockTask);
	mockCreateActivity.mockResolvedValue({
		id: 'activity-1',
		task_id: mockTask.id,
		actor: 'ai',
		action: 'status_change',
		old_value: 'backlog',
		new_value: 'ai_working',
		created_at: '2026-01-01T00:00:00.000Z',
	});
	mockCreateAILog.mockResolvedValue({
		id: 'log-1',
		task_id: mockTask.id,
		level: 'activity',
		message: 'test',
		metadata: null,
		created_at: '2026-01-01T00:00:00.000Z',
	});
	mockGenerateProjectContext.mockResolvedValue({
		framework: 'sveltekit',
		language: 'typescript',
		testFramework: 'vitest',
		packageManager: 'npm',
		keyDependencies: ['svelte', '@sveltejs/kit'],
		projectStructure: ['src', 'tests'],
	});
	mockBuildAgentPrompt.mockReturnValue('Test agent prompt');

	// Default: parseStreamLine returns null (no marker), parseStreamActivity returns null
	mockParseStreamLine.mockReturnValue(null);
	mockParseStreamActivity.mockReturnValue(null);

	// Mock execFile for isClaudeAvailable — claude is available
	mockExecFile.mockImplementation(((
		_cmd: string,
		_args: string[],
		callback?: ExecFileCallback,
	) => {
		const cb = callback;
		if (cb) {
			cb(null, '/usr/local/bin/claude', '');
		}
		return {} as ChildProcess;
	}) as typeof execFile);

	return { proc, emitStdoutLine, emitStderrLine };
}

/**
 * Flush all pending microtasks and timers.
 * Uses vi.advanceTimersByTimeAsync(0) which properly interleaves
 * timer callbacks and microtask resolution under fake timers.
 */
async function flushAsync(): Promise<void> {
	await vi.advanceTimersByTimeAsync(0);
}

// --- Tests ---

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	_resetForTesting();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('activity event persistence', () => {
	it('persists activity events to ai_logs with level activity', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);

		// Clear the mocks from startAgent setup
		mockCreateAILog.mockClear();
		mockBroadcast.mockClear();

		// Configure parser to return an activity event on next line
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: /src/lib/foo.ts',
		});

		emitStdoutLine('{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/src/lib/foo.ts"}}]}}');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledWith(db, {
			task_id: 'task-uuid-123',
			level: 'activity',
			message: 'Reading: /src/lib/foo.ts',
			metadata: { tool: 'Read' },
		});
	});

	it('persists activity events without tool as null metadata', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();

		// Activity without a tool (just text)
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			message: 'Analyzing the codebase structure.',
		});

		emitStdoutLine('some-line');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledWith(db, {
			task_id: 'task-uuid-123',
			level: 'activity',
			message: 'Analyzing the codebase structure.',
			metadata: null,
		});
	});

	it('throttles DB writes within 2 second window', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();
		mockBroadcast.mockClear();

		// First activity event at T=0 — should persist
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: /src/lib/first.ts',
		});
		emitStdoutLine('line-1');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1);

		// Second activity event at T=500ms — should NOT persist (within throttle window)
		vi.advanceTimersByTime(500);
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: /src/lib/second.ts',
		});
		emitStdoutLine('line-2');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1); // Still 1 — second write was throttled

		// Third activity event at T=1500ms — still within throttle window
		vi.advanceTimersByTime(1000);
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Write',
			message: 'Writing: /src/lib/output.ts',
		});
		emitStdoutLine('line-3');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1); // Still 1 — third write was throttled
	});

	it('resumes DB writes after throttle window expires', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();

		// First activity at T=0 — persists
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: first.ts',
		});
		emitStdoutLine('line-1');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1);

		// Advance past the 2-second throttle window
		vi.advanceTimersByTime(2001);

		// Second activity at T=2001ms — should persist (throttle window expired)
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Edit',
			message: 'Editing: second.ts',
		});
		emitStdoutLine('line-2');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(2);
		expect(mockCreateAILog).toHaveBeenNthCalledWith(2, db, {
			task_id: 'task-uuid-123',
			level: 'activity',
			message: 'Editing: second.ts',
			metadata: { tool: 'Edit' },
		});
	});

	it('broadcasts via SSE even when DB write is throttled', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();
		mockBroadcast.mockClear();

		const firstActivity = {
			type: 'activity' as const,
			tool: 'Read',
			message: 'Reading: first.ts',
		};
		const secondActivity = {
			type: 'activity' as const,
			tool: 'Read',
			message: 'Reading: second.ts',
		};

		// First activity at T=0
		mockParseStreamActivity.mockReturnValueOnce(firstActivity);
		emitStdoutLine('line-1');
		await flushAsync();

		// Second activity at T=500ms (within throttle window)
		vi.advanceTimersByTime(500);
		mockParseStreamActivity.mockReturnValueOnce(secondActivity);
		emitStdoutLine('line-2');
		await flushAsync();

		// Both should be broadcast via SSE
		expect(mockBroadcast).toHaveBeenCalledTimes(2);
		expect(mockBroadcast).toHaveBeenNthCalledWith(1, 'task-uuid-123', firstActivity);
		expect(mockBroadcast).toHaveBeenNthCalledWith(2, 'task-uuid-123', secondActivity);

		// But only the first should be persisted to DB
		expect(mockCreateAILog).toHaveBeenCalledTimes(1);
	});

	it('updates lastMessage with activity text', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);

		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Bash',
			message: 'Running: npm test',
		});

		emitStdoutLine('some-line');
		await flushAsync();

		const state = getActiveAgent();
		expect(state.lastMessage).toBe('Running: npm test');
	});

	it('updates lastMessage even when DB write is throttled', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);

		// First activity at T=0
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: first.ts',
		});
		emitStdoutLine('line-1');
		await flushAsync();

		expect(getActiveAgent().lastMessage).toBe('Reading: first.ts');

		// Second activity at T=500ms (within throttle) — lastMessage should still update
		vi.advanceTimersByTime(500);
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: second.ts',
		});
		emitStdoutLine('line-2');
		await flushAsync();

		expect(getActiveAgent().lastMessage).toBe('Reading: second.ts');
	});

	it('resets throttle timer on resetState via stopAgent', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();

		// First activity at T=0 — persists
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: first.ts',
		});
		emitStdoutLine('line-1');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1);

		// Stop the agent (which calls resetState, clearing lastActivityWriteTime)
		mockCreateAILog.mockClear();
		mockUpdateTask.mockResolvedValue(mockTask);
		mockCreateActivity.mockResolvedValue({
			id: 'activity-2',
			task_id: mockTask.id,
			actor: 'ai',
			action: 'status_change',
			old_value: 'running',
			new_value: 'backlog',
			created_at: '2026-01-01T00:00:00.000Z',
		});
		mockCreateAILog.mockResolvedValue({
			id: 'log-stop',
			task_id: mockTask.id,
			level: 'info',
			message: 'Agent stopped by user',
			metadata: null,
			created_at: '2026-01-01T00:00:00.000Z',
		});
		await stopAgent(db);

		// Advance only 500ms (normally within the throttle window from the first write)
		vi.advanceTimersByTime(500);

		// Start a new agent session — throttle should be reset
		mockCreateAILog.mockClear();
		mockBroadcast.mockClear();
		mockGetTask.mockResolvedValue(mockTask);
		mockUpdateTask.mockResolvedValue(mockTask);
		mockCreateActivity.mockResolvedValue({
			id: 'activity-3',
			task_id: mockTask.id,
			actor: 'ai',
			action: 'status_change',
			old_value: 'backlog',
			new_value: 'ai_working',
			created_at: '2026-01-01T00:00:00.000Z',
		});
		mockCreateAILog.mockResolvedValue({
			id: 'log-restart',
			task_id: mockTask.id,
			level: 'activity',
			message: 'test',
			metadata: null,
			created_at: '2026-01-01T00:00:00.000Z',
		});

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();

		// Activity should persist immediately (throttle was reset by stopAgent/resetState)
		mockParseStreamActivity.mockReturnValueOnce({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: new-session.ts',
		});
		emitStdoutLine('line-new');
		await flushAsync();

		expect(mockCreateAILog).toHaveBeenCalledTimes(1);
		expect(mockCreateAILog).toHaveBeenCalledWith(db, {
			task_id: 'task-uuid-123',
			level: 'activity',
			message: 'Reading: new-session.ts',
			metadata: { tool: 'Read' },
		});
	});

	it('does not persist or broadcast when no activity event is parsed', async () => {
		const { emitStdoutLine } = setupDefaultMocks();
		vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

		await startAgent('task-uuid-123', db, testConfig);
		mockCreateAILog.mockClear();
		mockBroadcast.mockClear();

		// Both parsers return null
		mockParseStreamLine.mockReturnValueOnce(null);
		mockParseStreamActivity.mockReturnValueOnce(null);

		emitStdoutLine('some-irrelevant-line');
		await flushAsync();

		// No DB write, no broadcast
		expect(mockCreateAILog).not.toHaveBeenCalled();
		expect(mockBroadcast).not.toHaveBeenCalled();
	});
});
