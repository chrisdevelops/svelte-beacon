import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAssistResponse, callAnthropicAssist, AnthropicAPIError } from '../client.js';
import type { AssistResponse } from '../client.js';

describe('parseAssistResponse', () => {
	it('parses valid JSON response', () => {
		const json = JSON.stringify({
			improved_description: 'The submit button on the login form does not respond to clicks.',
			suggested_type: 'bug',
			suggested_priority: 'high',
			reasoning: 'Clarified which button and what the failure behavior is.',
		});

		const result = parseAssistResponse(json);

		expect(result.improved_description).toBe('The submit button on the login form does not respond to clicks.');
		expect(result.suggested_type).toBe('bug');
		expect(result.suggested_priority).toBe('high');
		expect(result.reasoning).toBe('Clarified which button and what the failure behavior is.');
	});

	it('strips markdown code fences', () => {
		const json = '```json\n' + JSON.stringify({
			improved_description: 'Fixed description',
			suggested_type: 'feature',
			suggested_priority: 'low',
			reasoning: 'Cleaned up.',
		}) + '\n```';

		const result = parseAssistResponse(json);

		expect(result.improved_description).toBe('Fixed description');
		expect(result.suggested_type).toBe('feature');
		expect(result.suggested_priority).toBe('low');
	});

	it('falls back to other/medium for invalid type and priority values', () => {
		const json = JSON.stringify({
			improved_description: 'Some description',
			suggested_type: 'invalid_type',
			suggested_priority: 'invalid_priority',
			reasoning: 'Some reasoning.',
		});

		const result = parseAssistResponse(json);

		expect(result.suggested_type).toBe('other');
		expect(result.suggested_priority).toBe('medium');
		expect(result.improved_description).toBe('Some description');
	});

	it('falls back gracefully for non-JSON text', () => {
		const result = parseAssistResponse('This is just plain text, not JSON at all.');

		expect(result.improved_description).toBe('This is just plain text, not JSON at all.');
		expect(result.suggested_type).toBe('other');
		expect(result.suggested_priority).toBe('medium');
		expect(result.reasoning).toBe('Could not parse AI response as JSON.');
	});

	it('handles missing fields with defaults', () => {
		const json = JSON.stringify({
			improved_description: 'A valid description',
		});

		const result = parseAssistResponse(json);

		expect(result.improved_description).toBe('A valid description');
		expect(result.suggested_type).toBe('other');
		expect(result.suggested_priority).toBe('medium');
		expect(result.reasoning).toBe('');
	});
});

describe('callAnthropicAssist', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function mockFetch(response: { ok: boolean; status: number; body: unknown }): void {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: response.ok,
			status: response.status,
			json: () => Promise.resolve(response.body),
			text: () => Promise.resolve(
				typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
			),
		}));
	}

	it('makes POST to correct URL with correct headers', async () => {
		const responsePayload: AssistResponse = {
			improved_description: 'Improved',
			suggested_type: 'bug',
			suggested_priority: 'high',
			reasoning: 'Clarified.',
		};

		mockFetch({
			ok: true,
			status: 200,
			body: {
				content: [{ type: 'text', text: JSON.stringify(responsePayload) }],
			},
		});

		await callAnthropicAssist('test-api-key', 'system prompt', 'user message');

		const fetchMock = vi.mocked(globalThis.fetch);
		expect(fetchMock).toHaveBeenCalledOnce();

		const [url, options] = fetchMock.mock.calls[0]!;
		expect(url).toBe('https://api.anthropic.com/v1/messages');
		expect(options).toBeDefined();

		const reqOptions = options as RequestInit;
		const headers = reqOptions.headers as Record<string, string>;
		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['x-api-key']).toBe('test-api-key');
		expect(headers['anthropic-version']).toBe('2023-06-01');
		expect(reqOptions.method).toBe('POST');

		const body = JSON.parse(reqOptions.body as string) as Record<string, unknown>;
		expect(body['model']).toBe('claude-sonnet-4-20250514');
		expect(body['max_tokens']).toBe(1024);
		expect(body['system']).toBe('system prompt');
		expect(body['messages']).toEqual([{ role: 'user', content: 'user message' }]);
	});

	it('returns parsed response on success', async () => {
		const responsePayload: AssistResponse = {
			improved_description: 'The login button is unresponsive when clicked.',
			suggested_type: 'bug',
			suggested_priority: 'critical',
			reasoning: 'Made the description more specific.',
		};

		mockFetch({
			ok: true,
			status: 200,
			body: {
				content: [{ type: 'text', text: JSON.stringify(responsePayload) }],
			},
		});

		const result = await callAnthropicAssist('key', 'sys', 'usr');

		expect(result.improved_description).toBe('The login button is unresponsive when clicked.');
		expect(result.suggested_type).toBe('bug');
		expect(result.suggested_priority).toBe('critical');
		expect(result.reasoning).toBe('Made the description more specific.');
	});

	it('throws AnthropicAPIError on non-ok response with correct statusCode', async () => {
		mockFetch({
			ok: false,
			status: 429,
			body: 'Rate limited',
		});

		await expect(callAnthropicAssist('key', 'sys', 'usr'))
			.rejects
			.toThrow(AnthropicAPIError);

		try {
			await callAnthropicAssist('key', 'sys', 'usr');
		} catch (err) {
			const apiError = err as AnthropicAPIError;
			expect(apiError.statusCode).toBe(429);
			expect(apiError.message).toContain('429');
		}
	});

	it('throws AnthropicAPIError when no text block in response', async () => {
		mockFetch({
			ok: true,
			status: 200,
			body: {
				content: [{ type: 'image', source: {} }],
			},
		});

		await expect(callAnthropicAssist('key', 'sys', 'usr'))
			.rejects
			.toThrow(AnthropicAPIError);

		try {
			await callAnthropicAssist('key', 'sys', 'usr');
		} catch (err) {
			const apiError = err as AnthropicAPIError;
			expect(apiError.statusCode).toBe(500);
			expect(apiError.message).toContain('No text content');
		}
	});
});
