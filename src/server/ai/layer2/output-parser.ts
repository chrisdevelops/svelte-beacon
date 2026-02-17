/**
 * Layer 2: Claude Code stream-json output parser.
 *
 * Parses lines from Claude Code's `--output-format stream-json` stdout
 * and extracts structured [BEACON:*] markers into typed AgentMarker objects.
 *
 * This module does not import from Layer 1.
 */

import type { AgentMarker, AgentPhase, ActivityEvent } from './types.js';

const VALID_PHASES: ReadonlySet<string> = new Set<AgentPhase>([
	'starting',
	'analyzing',
	'planning',
	'implementing',
	'testing',
	'verifying',
	'committing',
]);

const MARKER_RE = /\[BEACON:(PROGRESS|BLOCKED|COMPLETE|ERROR)\]\s*(\{.*\})/;

/**
 * Parse a single line from Claude Code's stream-json output.
 *
 * Each line is a JSON envelope. We only care about "assistant" and "result"
 * types -- all others (system, tool_use, tool_result) are ignored.
 *
 * Returns an AgentMarker if the text inside the envelope contains a
 * [BEACON:*] marker, or null otherwise.
 */
export function parseStreamLine(line: string): AgentMarker | null {
	const trimmed = line.trim();
	if (trimmed === '') return null;

	let envelope: Record<string, unknown>;
	try {
		envelope = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return null;
	}

	const envelopeType = envelope['type'];

	if (envelopeType === 'assistant') {
		const message = envelope['message'] as Record<string, unknown> | undefined;
		if (!message) return null;

		const content = message['content'] as Array<Record<string, unknown>> | undefined;
		if (!Array.isArray(content) || content.length === 0) return null;

		const firstBlock = content[0];
		if (!firstBlock || firstBlock['type'] !== 'text') return null;

		const text = firstBlock['text'];
		if (typeof text !== 'string') return null;

		return extractBeaconMarker(text);
	}

	if (envelopeType === 'result') {
		const result = envelope['result'];
		if (typeof result !== 'string') return null;

		return extractBeaconMarker(result);
	}

	return null;
}

/**
 * Extract a [BEACON:*] marker from a text string.
 *
 * Marker format: `[BEACON:TYPE] {"json":"payload"}`
 *
 * Returns the typed AgentMarker if a valid marker is found, or null if
 * the text contains no marker, the marker type is unknown, or the JSON
 * payload fails to parse or is missing required fields.
 */
export function extractBeaconMarker(text: string): AgentMarker | null {
	const match = text.match(MARKER_RE);
	if (!match) return null;

	const [, markerType, jsonStr] = match;

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(jsonStr!) as Record<string, unknown>;
	} catch {
		return null;
	}

	switch (markerType) {
		case 'PROGRESS': {
			const phase = payload['phase'];
			const message = payload['message'];
			if (typeof phase !== 'string' || !VALID_PHASES.has(phase)) return null;
			if (typeof message !== 'string') return null;
			return { type: 'progress', phase: phase as AgentPhase, message };
		}

		case 'BLOCKED': {
			const question = payload['question'];
			if (typeof question !== 'string') return null;
			return { type: 'blocked', question };
		}

		case 'COMPLETE': {
			const branch = payload['branch'];
			const prUrl = payload['prUrl'];
			const summary = payload['summary'];
			if (typeof branch !== 'string') return null;
			if (prUrl !== null && typeof prUrl !== 'string') return null;
			if (typeof summary !== 'string') return null;
			return {
				type: 'complete',
				branch,
				prUrl: typeof prUrl === 'string' ? prUrl : null,
				summary,
			};
		}

		case 'ERROR': {
			const message = payload['message'];
			if (typeof message !== 'string') return null;
			return { type: 'error', message };
		}

		default:
			return null;
	}
}

const MAX_ACTIVITY_LENGTH = 200;

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
export function truncateMessage(text: string, max: number = MAX_ACTIVITY_LENGTH): string {
	if (text.length <= max) return text;
	return text.slice(0, max) + '...';
}

/**
 * Summarize a tool_use event into a human-readable activity message.
 * Returns the tool name and a brief description of what it's doing.
 */
function summarizeToolUse(name: string, input: Record<string, unknown>): ActivityEvent {
	let message: string;

	switch (name) {
		case 'Read':
			message = `Reading: ${input['file_path'] ?? 'file'}`;
			break;
		case 'Write':
			message = `Writing: ${input['file_path'] ?? 'file'}`;
			break;
		case 'Edit':
			message = `Editing: ${input['file_path'] ?? 'file'}`;
			break;
		case 'Bash': {
			const cmd = input['command'];
			message = typeof cmd === 'string'
				? `Running: ${truncateMessage(cmd, 120)}`
				: 'Running command';
			break;
		}
		case 'Glob':
			message = `Searching files: ${input['pattern'] ?? ''}`;
			break;
		case 'Grep':
			message = `Searching code: ${input['pattern'] ?? ''}`;
			break;
		case 'Task':
			message = `Launching agent: ${input['description'] ?? ''}`;
			break;
		case 'WebFetch':
			message = `Fetching: ${input['url'] ?? 'URL'}`;
			break;
		case 'WebSearch':
			message = `Searching web: ${input['query'] ?? ''}`;
			break;
		default:
			message = `Using tool: ${name}`;
	}

	return { type: 'activity', tool: name, message };
}

/**
 * Parse a single line from Claude Code's stream-json output and extract
 * human-readable activity for real-time display.
 *
 * Unlike `parseStreamLine()` which only extracts [BEACON:*] markers,
 * this function extracts activity from *all* stream-json event types:
 * - `assistant` with text → first ~200 chars of text content
 * - `assistant` with tool_use → tool name + input summary
 * - `tool_result`, `system`, and other types → skipped (null)
 *
 * Activity events are ephemeral (not persisted to DB) and are broadcast
 * via SSE for real-time dashboard updates only.
 */
export function parseStreamActivity(line: string): ActivityEvent | null {
	const trimmed = line.trim();
	if (trimmed === '') return null;

	let envelope: Record<string, unknown>;
	try {
		envelope = JSON.parse(trimmed) as Record<string, unknown>;
	} catch {
		return null;
	}

	const envelopeType = envelope['type'];

	if (envelopeType === 'assistant') {
		const message = envelope['message'] as Record<string, unknown> | undefined;
		if (!message) return null;

		const content = message['content'] as Array<Record<string, unknown>> | undefined;
		if (!Array.isArray(content) || content.length === 0) return null;

		// Check each content block — tool_use blocks are more useful than text
		for (const block of content) {
			if (block['type'] === 'tool_use') {
				const name = block['name'];
				const input = block['input'];
				if (typeof name === 'string' && input && typeof input === 'object') {
					return summarizeToolUse(name, input as Record<string, unknown>);
				}
			}
		}

		// Fall back to text content if no tool_use blocks
		const firstBlock = content[0];
		if (firstBlock && firstBlock['type'] === 'text') {
			const text = firstBlock['text'];
			if (typeof text === 'string' && text.trim().length > 0) {
				// Skip lines that are just BEACON markers — those are handled by parseStreamLine
				if (MARKER_RE.test(text)) return null;
				return { type: 'activity', message: text.trim() };
			}
		}

		return null;
	}

	// Skip tool_result, system, result, and all other types
	return null;
}
