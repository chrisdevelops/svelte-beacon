import { describe, it, expect } from 'vitest';
import { parseStreamActivity } from '../output-parser.js';

// --- Helpers to build stream-json envelopes ---

function assistantTextEnvelope(text: string): string {
	return JSON.stringify({
		type: 'assistant',
		message: {
			content: [{ type: 'text', text }],
		},
	});
}

function assistantToolUseEnvelope(name: string, input: Record<string, unknown>): string {
	return JSON.stringify({
		type: 'assistant',
		message: {
			content: [{ type: 'tool_use', id: 'tool-123', name, input }],
		},
	});
}

function toolResultEnvelope(output: string): string {
	return JSON.stringify({
		type: 'tool_result',
		tool_use_id: 'tool-123',
		output,
	});
}

function systemEnvelope(message: string): string {
	return JSON.stringify({
		type: 'system',
		message,
	});
}

function resultEnvelope(result: string): string {
	return JSON.stringify({
		type: 'result',
		result,
		duration_ms: 1234,
	});
}

// --- parseStreamActivity: tool_use events ---

describe('parseStreamActivity — tool_use events', () => {
	it('extracts Read tool with file path', () => {
		const line = assistantToolUseEnvelope('Read', { file_path: '/src/lib/foo.ts' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: /src/lib/foo.ts',
		});
	});

	it('extracts Write tool with file path', () => {
		const line = assistantToolUseEnvelope('Write', { file_path: '/src/lib/bar.ts', content: 'export const x = 1;' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Write',
			message: 'Writing: /src/lib/bar.ts',
		});
	});

	it('extracts Edit tool with file path', () => {
		const line = assistantToolUseEnvelope('Edit', { file_path: '/src/lib/baz.ts', old_string: 'foo', new_string: 'bar' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Edit',
			message: 'Editing: /src/lib/baz.ts',
		});
	});

	it('extracts Bash tool with command', () => {
		const line = assistantToolUseEnvelope('Bash', { command: 'npm test' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Bash',
			message: 'Running: npm test',
		});
	});

	it('truncates long Bash commands', () => {
		const longCmd = 'a'.repeat(200);
		const line = assistantToolUseEnvelope('Bash', { command: longCmd });

		const result = parseStreamActivity(line);

		expect(result).not.toBeNull();
		expect(result!.message.length).toBeLessThanOrEqual(203); // "Running: " + 120 + "..."
		expect(result!.message).toContain('...');
	});

	it('extracts Glob tool with pattern', () => {
		const line = assistantToolUseEnvelope('Glob', { pattern: '**/*.test.ts' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Glob',
			message: 'Searching files: **/*.test.ts',
		});
	});

	it('extracts Grep tool with pattern', () => {
		const line = assistantToolUseEnvelope('Grep', { pattern: 'function\\s+handleClick' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Grep',
			message: 'Searching code: function\\s+handleClick',
		});
	});

	it('extracts Task tool with description', () => {
		const line = assistantToolUseEnvelope('Task', { description: 'Search for tests', prompt: 'Find all test files' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Task',
			message: 'Launching agent: Search for tests',
		});
	});

	it('extracts WebFetch tool with URL', () => {
		const line = assistantToolUseEnvelope('WebFetch', { url: 'https://example.com/api' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'WebFetch',
			message: 'Fetching: https://example.com/api',
		});
	});

	it('extracts WebSearch tool with query', () => {
		const line = assistantToolUseEnvelope('WebSearch', { query: 'svelte 5 runes documentation' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'WebSearch',
			message: 'Searching web: svelte 5 runes documentation',
		});
	});

	it('handles unknown tool names gracefully', () => {
		const line = assistantToolUseEnvelope('CustomTool', { foo: 'bar' });

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'CustomTool',
			message: 'Using tool: CustomTool',
		});
	});

	it('prefers tool_use over text when both are present', () => {
		const line = JSON.stringify({
			type: 'assistant',
			message: {
				content: [
					{ type: 'text', text: 'Let me read this file' },
					{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/foo.ts' } },
				],
			},
		});

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			tool: 'Read',
			message: 'Reading: /foo.ts',
		});
	});
});

// --- parseStreamActivity: assistant text events ---

describe('parseStreamActivity — assistant text events', () => {
	it('extracts text content from assistant messages', () => {
		const line = assistantTextEnvelope('I am now analyzing the codebase structure.');

		const result = parseStreamActivity(line);

		expect(result).toEqual({
			type: 'activity',
			message: 'I am now analyzing the codebase structure.',
		});
		expect(result!.tool).toBeUndefined();
	});

	it('truncates long text to ~200 chars', () => {
		const longText = 'A'.repeat(300);
		const line = assistantTextEnvelope(longText);

		const result = parseStreamActivity(line);

		expect(result).not.toBeNull();
		expect(result!.message.length).toBeLessThanOrEqual(203); // 200 + "..."
		expect(result!.message).toContain('...');
	});

	it('returns null for BEACON marker text (handled by parseStreamLine)', () => {
		const line = assistantTextEnvelope(
			'[BEACON:PROGRESS] {"phase":"analyzing","message":"Reading codebase"}',
		);

		const result = parseStreamActivity(line);

		expect(result).toBeNull();
	});

	it('returns null for empty text content', () => {
		const line = assistantTextEnvelope('');

		const result = parseStreamActivity(line);

		expect(result).toBeNull();
	});

	it('returns null for whitespace-only text content', () => {
		const line = assistantTextEnvelope('   \n  \t  ');

		const result = parseStreamActivity(line);

		expect(result).toBeNull();
	});
});

// --- parseStreamActivity: ignored event types ---

describe('parseStreamActivity — ignored event types', () => {
	it('returns null for tool_result events', () => {
		const line = toolResultEnvelope('File contents here...');

		expect(parseStreamActivity(line)).toBeNull();
	});

	it('returns null for system events', () => {
		const line = systemEnvelope('Initializing...');

		expect(parseStreamActivity(line)).toBeNull();
	});

	it('returns null for result events', () => {
		const line = resultEnvelope('Task completed successfully.');

		expect(parseStreamActivity(line)).toBeNull();
	});

	it('returns null for empty lines', () => {
		expect(parseStreamActivity('')).toBeNull();
		expect(parseStreamActivity('   ')).toBeNull();
	});

	it('returns null for malformed JSON', () => {
		expect(parseStreamActivity('{not valid json}')).toBeNull();
	});

	it('returns null for assistant with empty content array', () => {
		const line = JSON.stringify({
			type: 'assistant',
			message: { content: [] },
		});

		expect(parseStreamActivity(line)).toBeNull();
	});

	it('returns null for assistant with no message', () => {
		const line = JSON.stringify({
			type: 'assistant',
		});

		expect(parseStreamActivity(line)).toBeNull();
	});
});
