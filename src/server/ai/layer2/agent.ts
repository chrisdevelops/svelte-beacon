/**
 * Layer 2: Agent lifecycle manager.
 *
 * In-memory singleton managing a single Claude Code subprocess.
 * Only one agent task runs at a time (single-developer workflow).
 * The server tracks the active process in module-level state.
 *
 * This module does not import from Layer 1.
 */

import { spawn, execFile } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ChildProcess } from 'node:child_process';
import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../../config.js';
import type { AgentState } from './types.js';
import { IDLE_STATE } from './types.js';
import { parseStreamLine } from './output-parser.js';
import { buildAgentPrompt } from './prompt-builder.js';
import { generateProjectContext } from './context-generator.js';
import { broadcastToSSEClients } from './sse.js';
import { getTask, updateTask, updateTaskAIFields } from '../../db/queries/tasks.js';
import { createActivity } from '../../db/queries/activity.js';
import { createAILog } from '../../db/queries/ai-logs.js';

// --- Module-level singleton state ---

let currentState: AgentState = { ...IDLE_STATE };
let childProcess: ChildProcess | null = null;
let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let currentPrompt: string = '';

/**
 * Return the current agent state snapshot.
 */
export function getActiveAgent(): AgentState {
	return { ...currentState };
}

/**
 * Check whether the Claude CLI is available on the system PATH.
 * Runs `which claude` and returns true if exit code is 0.
 */
export async function isClaudeAvailable(): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		execFile('which', ['claude'], (error) => {
			resolve(error === null);
		});
	});
}

/**
 * Reset internal state to idle. Used after stop, completion, or failure.
 * Clears the timeout handle and nulls the child process reference.
 */
function resetState(): void {
	if (timeoutHandle !== null) {
		clearTimeout(timeoutHandle);
		timeoutHandle = null;
	}
	childProcess = null;
	currentPrompt = '';
	currentState = { ...IDLE_STATE };
}

/**
 * Start the AI agent on a task.
 *
 * Validates preconditions, fetches the task, generates fresh project
 * context, builds the prompt, spawns Claude Code as a child process,
 * and sets up stdout parsing for structured markers.
 *
 * @throws Error if an agent is already active, the task is not found,
 * or the Claude CLI is not installed.
 */
export async function startAgent(
	taskId: string,
	db: Client,
	config: ResolvedConfig,
): Promise<AgentState> {
	if (currentState.status !== 'idle') {
		throw new Error('Agent is already active');
	}

	const task = await getTask(db, taskId);
	if (!task) {
		throw new Error('Task not found');
	}

	const claudeInstalled = await isClaudeAvailable();
	if (!claudeInstalled) {
		throw new Error('Claude CLI not installed');
	}

	// Transition state to running
	currentState = {
		status: 'running',
		taskId,
		phase: 'starting',
		startedAt: new Date().toISOString(),
		lastMessage: null,
		blockedQuestion: null,
	};

	// Update task status in DB
	await updateTask(db, taskId, { status: 'ai_working' });
	await createActivity(db, {
		task_id: taskId,
		actor: 'ai',
		action: 'status_change',
		old_value: task.status,
		new_value: 'ai_working',
	});

	// Generate fresh project context
	const context = await generateProjectContext();

	// Build the prompt
	const prompt = buildAgentPrompt({
		task: {
			type: task.type,
			priority: task.priority,
			description: task.description,
			route: task.route,
			elementSelector: task.element_selector,
			publicId: task.public_id,
		},
		adminNotes: null,
		context,
		config: {
			requireTestsForBugs: config.ai.requireTestsForBugs,
			createPR: config.ai.createPR,
		},
	});
	currentPrompt = prompt;

	// Spawn Claude Code
	spawnAgentProcess(prompt, taskId, db, config);

	return { ...currentState };
}

/**
 * Spawn the Claude Code child process and wire up event handlers.
 */
function spawnAgentProcess(
	prompt: string,
	taskId: string,
	db: Client,
	config: ResolvedConfig,
): void {
	const proc = spawn('claude', [
		'--print',
		'--output-format', 'stream-json',
		'--max-turns', '50',
		prompt,
	], {
		cwd: process.cwd(),
		env: { ...process.env },
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	childProcess = proc;

	// Set up line-by-line stdout parsing
	if (proc.stdout) {
		const rl = createInterface({ input: proc.stdout });
		rl.on('line', (line: string) => {
			void handleOutputLine(line, taskId, db);
		});
	}

	// Handle process close
	proc.on('close', (code: number | null) => {
		void handleProcessClose(code, taskId, db);
	});

	// Set up max duration timeout
	timeoutHandle = setTimeout(() => {
		void handleTimeout(taskId, db);
	}, config.ai.maxDurationMinutes * 60_000);
}

/**
 * Process a single line of stdout from the Claude Code process.
 * Parses for structured markers and updates state/DB accordingly.
 */
async function handleOutputLine(
	line: string,
	taskId: string,
	db: Client,
): Promise<void> {
	const marker = parseStreamLine(line);
	if (!marker) return;

	// Log every marker to the database
	await createAILog(db, {
		task_id: taskId,
		level: marker.type,
		message: JSON.stringify(marker),
		metadata: marker as unknown as Record<string, unknown>,
	});

	switch (marker.type) {
		case 'progress': {
			currentState = {
				...currentState,
				phase: marker.phase,
				lastMessage: marker.message,
			};
			broadcastToSSEClients(taskId, marker);
			break;
		}

		case 'blocked': {
			currentState = {
				...currentState,
				status: 'blocked',
				blockedQuestion: marker.question,
			};
			await updateTask(db, taskId, { status: 'blocked' });
			await updateTaskAIFields(db, taskId, { ai_blocked_reason: marker.question });
			broadcastToSSEClients(taskId, marker);
			break;
		}

		case 'complete': {
			currentState = {
				...currentState,
				status: 'completed',
			};
			await updateTaskAIFields(db, taskId, {
				ai_branch: marker.branch,
				ai_pr_url: marker.prUrl,
			});
			await updateTask(db, taskId, { status: 'needs_review' });
			broadcastToSSEClients(taskId, marker);
			break;
		}

		case 'error': {
			await createAILog(db, {
				task_id: taskId,
				level: 'error',
				message: marker.message,
			});
			broadcastToSSEClients(taskId, marker);
			break;
		}
	}
}

/**
 * Handle the child process closing.
 * If the agent is still in 'running' state (no COMPLETE marker was seen),
 * mark it as failed and revert the task to backlog.
 */
async function handleProcessClose(
	code: number | null,
	taskId: string,
	db: Client,
): Promise<void> {
	// If already idle (stopped by user) or completed, do nothing
	if (currentState.status === 'idle' || currentState.status === 'completed') {
		if (currentState.status === 'completed') {
			resetState();
		}
		return;
	}

	// Process exited while still running — treat as failure
	if (currentState.status === 'running') {
		const errorMessage = `Agent process exited with code ${code ?? 'unknown'}`;

		await createAILog(db, {
			task_id: taskId,
			level: 'error',
			message: errorMessage,
		});

		broadcastToSSEClients(taskId, {
			type: 'error',
			message: errorMessage,
		});

		await updateTask(db, taskId, { status: 'backlog' });

		resetState();
	}
}

/**
 * Handle the max duration timeout.
 * Kills the child process, sets state to failed, and reverts the task.
 */
async function handleTimeout(
	taskId: string,
	db: Client,
): Promise<void> {
	if (childProcess && currentState.status === 'running') {
		childProcess.kill('SIGTERM');

		const errorMessage = 'Agent timed out (exceeded maximum duration)';

		await createAILog(db, {
			task_id: taskId,
			level: 'error',
			message: errorMessage,
		});

		broadcastToSSEClients(taskId, {
			type: 'error',
			message: errorMessage,
		});

		await updateTask(db, taskId, { status: 'backlog' });

		resetState();
	}
}

/**
 * Stop the currently running agent.
 *
 * Sends SIGTERM to the child process, resets state to idle,
 * and reverts the task status to backlog.
 *
 * @throws Error if no agent is currently active.
 */
export async function stopAgent(db: Client): Promise<AgentState> {
	if (currentState.status === 'idle') {
		throw new Error('No active agent');
	}

	const taskId = currentState.taskId;

	// Kill the child process
	if (childProcess) {
		childProcess.kill('SIGTERM');
	}

	// Revert task to backlog
	if (taskId) {
		await updateTask(db, taskId, { status: 'backlog' });
		await createActivity(db, {
			task_id: taskId,
			actor: 'ai',
			action: 'status_change',
			old_value: currentState.status,
			new_value: 'backlog',
		});

		await createAILog(db, {
			task_id: taskId,
			level: 'info',
			message: 'Agent stopped by user',
		});
	}

	resetState();

	return { ...IDLE_STATE };
}

/**
 * Unblock the agent by providing an answer to its question.
 *
 * Kills the current process, clears the blocked reason, and restarts
 * the agent with a new prompt that includes the developer's answer.
 *
 * @throws Error if the agent is not in the blocked state.
 */
export async function unblockAgent(
	answer: string,
	db: Client,
	config: ResolvedConfig,
): Promise<AgentState> {
	if (currentState.status !== 'blocked') {
		throw new Error('Agent is not blocked');
	}

	const taskId = currentState.taskId;
	if (!taskId) {
		throw new Error('No task ID in blocked state');
	}

	// Kill the existing process
	if (childProcess) {
		childProcess.kill('SIGTERM');
	}

	// Clear the timeout
	if (timeoutHandle !== null) {
		clearTimeout(timeoutHandle);
		timeoutHandle = null;
	}

	// Clear blocked reason in DB
	await updateTaskAIFields(db, taskId, { ai_blocked_reason: null });

	// Log the answer as activity
	await createActivity(db, {
		task_id: taskId,
		actor: 'developer',
		action: 'unblock_answer',
		new_value: answer,
	});

	await createAILog(db, {
		task_id: taskId,
		level: 'info',
		message: `Developer answered: ${answer}`,
	});

	// Build new prompt with the answer appended
	const newPrompt = currentPrompt + `\n\n## Developer Answer\n\nThe developer answered your question:\n\n${answer}`;

	// Update task status back to ai_working
	await updateTask(db, taskId, { status: 'ai_working' });

	// Reset process state and restart
	currentState = {
		status: 'running',
		taskId,
		phase: 'starting',
		startedAt: new Date().toISOString(),
		lastMessage: null,
		blockedQuestion: null,
	};
	currentPrompt = newPrompt;

	// Spawn new process
	spawnAgentProcess(newPrompt, taskId, db, config);

	return { ...currentState };
}

/**
 * Reset the agent state to idle. Exposed only for testing.
 * @internal
 */
export function _resetForTesting(): void {
	if (childProcess) {
		childProcess.kill('SIGTERM');
	}
	resetState();
}
