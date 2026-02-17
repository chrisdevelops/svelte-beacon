// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchConfig, submitFeedback } from '../internal/api.js';
import type { FeedbackPayload } from '../internal/types.js';

const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('fetchConfig', () => {
	it('returns widget config on success', async () => {
		const widgetConfig = {
			screenshot: true,
			elementSelector: true,
			aiAssist: false,
			requireEmail: false,
			position: 'bottom-right' as const,
		};
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ widget: widgetConfig, mode: 'development' }),
		});

		const result = await fetchConfig();
		expect(result).toEqual(widgetConfig);
		expect(mockFetch).toHaveBeenCalledWith('/__beacon/api/config');
	});

	it('throws on non-ok response', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			status: 500,
		});

		await expect(fetchConfig()).rejects.toThrow('Config fetch failed: 500');
	});
});

describe('submitFeedback', () => {
	const payload: FeedbackPayload = {
		type: 'bug',
		priority: 'high',
		description: 'Something broke',
		route: 'http://localhost/page',
		element_selector: null,
		metadata: null,
		email: null,
	};

	it('returns ok result on 201', async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ id: 'abc-123', public_id: 1 }),
		});

		const result = await submitFeedback(payload);
		expect(result).toEqual({
			ok: true,
			data: { id: 'abc-123', public_id: 1 },
		});
		expect(mockFetch).toHaveBeenCalledWith('/__beacon/api/feedback', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});
	});

	it('returns error result on validation failure', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			json: () =>
				Promise.resolve({
					error: 'Validation failed',
					fields: { description: 'Required' },
				}),
		});

		const result = await submitFeedback(payload);
		expect(result).toEqual({
			ok: false,
			error: 'Validation failed',
			fields: { description: 'Required' },
		});
	});

	it('returns error result on server error without fields', async () => {
		mockFetch.mockResolvedValue({
			ok: false,
			json: () => Promise.resolve({ error: 'Internal server error' }),
		});

		const result = await submitFeedback(payload);
		expect(result).toEqual({
			ok: false,
			error: 'Internal server error',
			fields: undefined,
		});
	});

	it('returns network error on fetch failure', async () => {
		mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

		const result = await submitFeedback(payload);
		expect(result).toEqual({
			ok: false,
			error: 'Network error. Please try again.',
		});
	});
});
