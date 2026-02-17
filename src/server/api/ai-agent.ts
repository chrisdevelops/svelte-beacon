import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../config.js';
import { route, json } from '../router.js';
import {
	startAgent,
	stopAgent,
	unblockAgent,
	getActiveAgent,
} from '../ai/layer2/agent.js';
import { handleSSEConnection } from '../ai/layer2/sse.js';
import { getTask } from '../db/queries/tasks.js';
import { createActivity } from '../db/queries/activity.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

/**
 * POST /ai/start/:id
 *
 * Start the AI agent on a task. Validates the task exists, then
 * delegates to the agent lifecycle manager.
 */
export async function handleStartAI(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const taskId = params['id'];
	if (!taskId) {
		return json({ error: 'Task ID required' }, { status: 400 });
	}

	const task = await getTask(db, taskId);
	if (!task) {
		return json({ error: 'Task not found' }, { status: 404 });
	}

	try {
		const state = await startAgent(taskId, db, config);
		return json(state, { status: 202 });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);

		if (message === 'Agent is already active') {
			return json({ error: 'Agent is busy' }, { status: 409 });
		}
		if (message === 'Claude CLI not installed') {
			return json({ error: 'Claude CLI is not installed on the server' }, { status: 503 });
		}
		if (message === 'Task not found') {
			return json({ error: 'Task not found' }, { status: 404 });
		}

		return json({ error: 'Failed to start agent' }, { status: 500 });
	}
}

/**
 * POST /ai/stop/:id
 *
 * Stop the AI agent running on a task. Verifies the active agent
 * matches the requested task before stopping.
 */
export async function handleStopAI(
	_event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const taskId = params['id'];
	if (!taskId) {
		return json({ error: 'Task ID required' }, { status: 400 });
	}

	const agent = getActiveAgent();
	if (agent.status === 'idle' || agent.taskId !== taskId) {
		return json({ error: 'No active agent on this task' }, { status: 409 });
	}

	const state = await stopAgent(db);
	return json(state, { status: 200 });
}

/**
 * POST /ai/unblock/:id
 *
 * Provide an answer to unblock the AI agent. Parses the answer from
 * the request body, verifies the agent is blocked on this task, and
 * resumes the agent with the answer.
 */
export async function handleUnblockAI(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const taskId = params['id'];
	if (!taskId) {
		return json({ error: 'Task ID required' }, { status: 400 });
	}

	// Parse body for answer
	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const answer = typeof body['answer'] === 'string' ? body['answer'].trim() : '';
	if (!answer) {
		return json({ error: 'Answer is required' }, { status: 400 });
	}

	const agent = getActiveAgent();
	if (agent.status === 'idle' || agent.taskId !== taskId) {
		return json({ error: 'No active agent on this task' }, { status: 409 });
	}

	try {
		const state = await unblockAgent(answer, db, config);

		// Log the answer as activity
		createActivity(db, {
			task_id: taskId,
			actor: 'user',
			action: 'ai_unblock',
			new_value: answer,
		}).catch(() => {});

		return json(state, { status: 200 });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);

		if (message === 'Agent is not blocked') {
			return json({ error: 'Agent is not blocked' }, { status: 409 });
		}

		return json({ error: 'Failed to unblock agent' }, { status: 500 });
	}
}

/**
 * GET /ai/logs/:id
 *
 * Delegate to the SSE connection handler for streaming agent logs.
 */
export async function handleAILogs(
	event: RequestEvent,
	db: Client,
	config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	return handleSSEConnection(event, db, config, params);
}

// --- Route registration ---

route('POST', '/ai/start/:id', handleStartAI, { requireAuth: true });
route('POST', '/ai/stop/:id', handleStopAI, { requireAuth: true });
route('POST', '/ai/unblock/:id', handleUnblockAI, { requireAuth: true });
route('GET', '/ai/logs/:id', handleAILogs, { requireAuth: true });
