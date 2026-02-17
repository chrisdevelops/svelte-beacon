/**
 * Layer 2: SSE connection manager.
 *
 * Manages Server-Sent Event streams for real-time agent progress
 * updates to the dashboard. Each connection is tracked by a unique
 * ID and associated with a task ID.
 *
 * This module does not import from Layer 1.
 */

import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import type { ResolvedConfig } from '../../config.js';
import type { AgentMarker } from './types.js';
import { getTask } from '../../db/queries/tasks.js';
import { getAILogsByTaskId } from '../../db/queries/ai-logs.js';

type RequestEvent = Parameters<import('@sveltejs/kit').Handle>[0]['event'];

// --- Connection registry ---

interface SSEConnection {
	taskId: string;
	controller: ReadableStreamDefaultController<Uint8Array>;
}

const connections = new Map<string, SSEConnection>();

const encoder = new TextEncoder();

/**
 * Format an SSE event string from an event name and data payload.
 */
function formatSSE(eventName: string, data: unknown): string {
	return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Create a new SSE stream for a task.
 *
 * Returns the HTTP Response and a unique connection ID. The stream
 * sends an initial `connected` event with the task ID.
 *
 * @param taskId - The task to stream events for.
 * @returns The Response object and the connection ID.
 */
export function createSSEStream(taskId: string): { response: Response; connectionId: string } {
	const connectionId = randomUUID();

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			connections.set(connectionId, { taskId, controller });

			// Send initial connected event
			const payload = formatSSE('connected', { taskId });
			controller.enqueue(encoder.encode(payload));
		},
		cancel() {
			connections.delete(connectionId);
		},
	});

	const response = new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	});

	return { response, connectionId };
}

/**
 * Remove an SSE connection by its ID.
 *
 * Closes the stream controller and removes the connection from the
 * registry. Safe to call with an ID that does not exist.
 */
export function removeSSEConnection(id: string): void {
	const conn = connections.get(id);
	if (!conn) return;

	try {
		conn.controller.close();
	} catch {
		// Controller may already be closed
	}

	connections.delete(id);
}

/**
 * Broadcast an agent marker to all SSE connections for a given task.
 *
 * Iterates all connections matching the task ID and writes the marker
 * as an SSE event. Connections that throw on write (disconnected
 * clients) are automatically removed.
 */
export function broadcastToSSEClients(taskId: string, marker: AgentMarker): void {
	const timestamp = new Date().toISOString();

	let eventName: string;
	let data: Record<string, unknown>;

	switch (marker.type) {
		case 'progress':
			eventName = 'progress';
			data = { phase: marker.phase, message: marker.message, timestamp };
			break;
		case 'blocked':
			eventName = 'blocked';
			data = { question: marker.question, timestamp };
			break;
		case 'complete':
			eventName = 'complete';
			data = { branch: marker.branch, prUrl: marker.prUrl, summary: marker.summary, timestamp };
			break;
		case 'error':
			eventName = 'error';
			data = { message: marker.message, timestamp };
			break;
	}

	const payload = formatSSE(eventName, data);
	const encoded = encoder.encode(payload);

	const toRemove: string[] = [];

	for (const [id, conn] of connections) {
		if (conn.taskId !== taskId) continue;

		try {
			conn.controller.enqueue(encoded);
		} catch {
			// Client disconnected — mark for removal
			toRemove.push(id);
		}
	}

	for (const id of toRemove) {
		connections.delete(id);
	}
}

/**
 * Handle an SSE connection request for a task.
 *
 * If the request accepts `text/event-stream`, creates an SSE stream
 * and sends existing logs as catch-up events before streaming live.
 * Otherwise, returns the logs as a JSON array.
 *
 * @param event - The SvelteKit request event.
 * @param db - The database client.
 * @param _config - The resolved configuration (unused, reserved for future use).
 * @param params - Route parameters; expects `params.id` to be the task ID.
 */
export async function handleSSEConnection(
	event: RequestEvent,
	db: Client,
	_config: ResolvedConfig,
	params: Record<string, string>,
): Promise<Response> {
	const taskId = params['id'];
	if (!taskId) {
		return new Response(JSON.stringify({ error: 'Task ID required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// Verify task exists
	const task = await getTask(db, taskId);
	if (!task) {
		return new Response(JSON.stringify({ error: 'Task not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const accept = event.request.headers.get('Accept') ?? '';

	if (accept.includes('text/event-stream')) {
		// Create the SSE stream
		const { response, connectionId } = createSSEStream(taskId);

		// Send existing logs as catch-up events
		try {
			const logs = await getAILogsByTaskId(db, taskId);
			const conn = connections.get(connectionId);
			if (conn) {
				for (const log of logs) {
					const payload = formatSSE('log', {
						level: log.level,
						message: log.message,
						timestamp: log.created_at,
					});
					try {
						conn.controller.enqueue(encoder.encode(payload));
					} catch {
						// Connection closed during catch-up
						connections.delete(connectionId);
						break;
					}
				}
			}
		} catch {
			// Log fetch failure is non-fatal — stream is still valid
		}

		return response;
	}

	// Non-SSE request: return logs as JSON
	const logs = await getAILogsByTaskId(db, taskId);
	return new Response(JSON.stringify(logs), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

/**
 * Get the number of active connections. Exposed for testing.
 * @internal
 */
export function _getConnectionCount(): number {
	return connections.size;
}

/**
 * Clear all connections. Exposed for testing.
 * @internal
 */
export function _clearConnectionsForTesting(): void {
	for (const [id] of connections) {
		removeSSEConnection(id);
	}
	connections.clear();
}
