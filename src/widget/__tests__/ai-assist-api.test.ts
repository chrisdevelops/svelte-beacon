// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestAIAssist } from '../internal/api.js';

describe('requestAIAssist', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('sends POST request with correct body', async () => {
		const mockResponse = {
			improved_description: 'Better desc',
			suggested_type: 'bug',
			suggested_priority: 'high',
			reasoning: 'Improved',
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		}));

		await requestAIAssist({
			description: 'rough desc',
			type: 'bug',
			priority: 'medium',
		});

		expect(fetch).toHaveBeenCalledWith('/__beacon/api/ai/assist', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ description: 'rough desc', type: 'bug', priority: 'medium' }),
		});
	});

	it('returns ok result on success', async () => {
		const mockResponse = {
			improved_description: 'Better desc',
			suggested_type: 'bug',
			suggested_priority: 'high',
			reasoning: 'Improved',
		};
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(mockResponse),
		}));

		const result = await requestAIAssist({
			description: 'rough desc',
			type: 'bug',
			priority: 'medium',
		});

		expect(result).toEqual({ ok: true, data: mockResponse });
	});

	it('returns error on non-ok response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: false,
			json: () => Promise.resolve({ error: 'AI service unavailable' }),
		}));

		const result = await requestAIAssist({
			description: 'rough desc',
			type: 'bug',
			priority: 'medium',
		});

		expect(result).toEqual({ ok: false, error: 'AI service unavailable' });
	});

	it('returns network error on fetch failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failed')));

		const result = await requestAIAssist({
			description: 'rough desc',
			type: 'bug',
			priority: 'medium',
		});

		expect(result).toEqual({ ok: false, error: 'Network error. Please try again.' });
	});

	it('includes optional fields in payload', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({
				improved_description: 'Better',
				suggested_type: 'bug',
				suggested_priority: 'medium',
				reasoning: 'Ok',
			}),
		}));

		await requestAIAssist({
			description: 'desc',
			type: 'bug',
			priority: 'medium',
			route: '/test',
			element_selector: '#btn',
		});

		const call = vi.mocked(fetch).mock.calls[0]!;
		const body = JSON.parse(call[1]!.body as string);
		expect(body.route).toBe('/test');
		expect(body.element_selector).toBe('#btn');
	});
});
