import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createBeaconAPIEvent } from '../../../../test/mocks/request-event.js';
import { defaultConfig } from '../../../../test/mocks/factories.js';
import type { ResolvedConfig } from '../../config.js';

vi.mock('../../ai/layer1/client.js', () => ({
	callAnthropicAssist: vi.fn(),
	AnthropicAPIError: class AnthropicAPIError extends Error {
		readonly statusCode: number;
		constructor(message: string, statusCode: number) {
			super(message);
			this.name = 'AnthropicAPIError';
			this.statusCode = statusCode;
		}
	},
}));

vi.mock('../../ai/layer1/prompt.js', () => ({
	buildAssistPrompt: vi.fn().mockReturnValue({ system: 'test-system', user: 'test-user' }),
}));

import { handleAssist } from '../ai-assist.js';
import { callAnthropicAssist, AnthropicAPIError } from '../../ai/layer1/client.js';
import { buildAssistPrompt } from '../../ai/layer1/prompt.js';

const mockCallAnthropic = vi.mocked(callAnthropicAssist);
const mockBuildPrompt = vi.mocked(buildAssistPrompt);

const configWithKey: ResolvedConfig = {
	...defaultConfig,
	ai: { ...defaultConfig.ai, anthropicApiKey: 'test-key-123' },
};

const validBody = {
	description: 'The login button is broken on mobile',
	type: 'bug',
	priority: 'high',
	route: '/login',
	element_selector: '.btn-login',
};

const mockAssistResult = {
	improved_description: 'The login button does not respond to taps on mobile viewports.',
	suggested_type: 'bug',
	suggested_priority: 'high',
	reasoning: 'Clarified the failure mode and specified the viewport context.',
};

let db: Client;

beforeEach(async () => {
	db = await createTestDB();
	vi.clearAllMocks();
	mockCallAnthropic.mockResolvedValue(mockAssistResult);
	mockBuildPrompt.mockReturnValue({ system: 'test-system', user: 'test-user' });
});

describe('POST /ai/assist', () => {
	it('returns 503 when no API key is configured', async () => {
		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		const response = await handleAssist(event, db, defaultConfig);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error).toBe('AI assist is not configured');
	});

	it('returns 400 for missing description', async () => {
		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: { type: 'bug', priority: 'medium' },
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Validation failed');
		expect(body.fields.description).toBeDefined();
	});

	it('returns 400 for invalid type', async () => {
		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: { description: 'Test', type: 'invalid', priority: 'medium' },
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.fields.type).toContain('must be one of');
	});

	it('returns 400 for invalid JSON body', async () => {
		const url = new URL('http://localhost/__beacon/api/ai/assist');
		const request = new Request(url, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain' },
			body: 'not json',
		});
		const event = {
			url,
			request,
			params: {},
			route: { id: null },
			locals: {},
		} as unknown as Parameters<import('@sveltejs/kit').Handle>[0]['event'];

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
	});

	it('returns 200 with result on success', async () => {
		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.improved_description).toBe(mockAssistResult.improved_description);
		expect(body.suggested_type).toBe('bug');
		expect(body.suggested_priority).toBe('high');
		expect(body.reasoning).toBe(mockAssistResult.reasoning);
	});

	it('returns 502 when Anthropic returns non-429 error', async () => {
		mockCallAnthropic.mockRejectedValue(
			new AnthropicAPIError('Internal server error', 500),
		);

		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(502);
		expect(body.error).toBe('AI service unavailable');
	});

	it('returns 429 when Anthropic returns rate limit error', async () => {
		mockCallAnthropic.mockRejectedValue(
			new AnthropicAPIError('Rate limited', 429),
		);

		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toBe('Rate limited. Please try again shortly.');
	});

	it('returns 500 for unexpected errors', async () => {
		mockCallAnthropic.mockRejectedValue(new Error('Something unexpected'));

		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		const response = await handleAssist(event, db, configWithKey);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('AI assist failed');
	});

	it('passes correct arguments to buildAssistPrompt', async () => {
		const event = createBeaconAPIEvent('POST', '/ai/assist', {
			body: validBody,
		});

		await handleAssist(event, db, configWithKey);

		expect(mockBuildPrompt).toHaveBeenCalledOnce();
		expect(mockBuildPrompt).toHaveBeenCalledWith({
			description: 'The login button is broken on mobile',
			type: 'bug',
			priority: 'high',
			route: '/login',
			element_selector: '.btn-login',
		});

		expect(mockCallAnthropic).toHaveBeenCalledOnce();
		expect(mockCallAnthropic).toHaveBeenCalledWith(
			'test-key-123',
			'test-system',
			'test-user',
		);
	});
});
