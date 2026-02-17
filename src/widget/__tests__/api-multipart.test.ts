// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitFeedback, submitFeedbackWithAttachments } from '../internal/api.js';
import type { FeedbackPayload } from '../internal/types.js';

const mockPayload: FeedbackPayload = {
	type: 'bug',
	priority: 'medium',
	description: 'Something broke',
	route: '/test',
	element_selector: null,
	metadata: null,
	email: null,
};

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchSpy = vi.fn().mockResolvedValue(
		new Response(JSON.stringify({ id: 'abc', public_id: 1 }), {
			status: 201,
			headers: { 'Content-Type': 'application/json' },
		}),
	);
	vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('submitFeedbackWithAttachments', () => {
	it('falls back to JSON when no screenshot', async () => {
		const result = await submitFeedbackWithAttachments(mockPayload, null);

		expect(result.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
	});

	it('sends FormData when screenshot is provided', async () => {
		const screenshot = new Blob(['fake-png'], { type: 'image/png' });

		const result = await submitFeedbackWithAttachments(mockPayload, screenshot);

		expect(result.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		// Should NOT set Content-Type header — FormData sets it with boundary
		expect(init.headers).toBeUndefined();
		expect(init.body).toBeInstanceOf(FormData);
	});

	it('includes all payload fields in FormData', async () => {
		const payload: FeedbackPayload = {
			type: 'feature',
			priority: 'high',
			description: 'New feature',
			route: '/page',
			element_selector: '#btn',
			metadata: '{"key":"val"}',
			email: 'test@example.com',
		};
		const screenshot = new Blob(['fake'], { type: 'image/png' });

		await submitFeedbackWithAttachments(payload, screenshot);

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const formData = init.body as FormData;
		expect(formData.get('type')).toBe('feature');
		expect(formData.get('priority')).toBe('high');
		expect(formData.get('description')).toBe('New feature');
		expect(formData.get('route')).toBe('/page');
		expect(formData.get('element_selector')).toBe('#btn');
		expect(formData.get('metadata')).toBe('{"key":"val"}');
		expect(formData.get('email')).toBe('test@example.com');
		expect(formData.get('screenshot')).toBeInstanceOf(File);
	});

	it('omits null optional fields from FormData', async () => {
		const screenshot = new Blob(['fake'], { type: 'image/png' });

		await submitFeedbackWithAttachments(mockPayload, screenshot);

		const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		const formData = init.body as FormData;
		expect(formData.has('element_selector')).toBe(false);
		expect(formData.has('metadata')).toBe(false);
		expect(formData.has('email')).toBe(false);
	});

	it('returns error on network failure', async () => {
		fetchSpy.mockRejectedValue(new Error('Network error'));
		const screenshot = new Blob(['fake'], { type: 'image/png' });

		const result = await submitFeedbackWithAttachments(mockPayload, screenshot);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('Network error. Please try again.');
		}
	});

	it('returns server error on non-ok response', async () => {
		fetchSpy.mockResolvedValue(
			new Response(JSON.stringify({ error: 'Validation failed', fields: { description: 'required' } }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			}),
		);
		const screenshot = new Blob(['fake'], { type: 'image/png' });

		const result = await submitFeedbackWithAttachments(mockPayload, screenshot);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('Validation failed');
			expect(result.fields).toEqual({ description: 'required' });
		}
	});
});

describe('submitFeedback', () => {
	it('sends JSON with Content-Type header', async () => {
		const result = await submitFeedback(mockPayload);

		expect(result.ok).toBe(true);
		const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/__beacon/api/feedback');
		expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
		expect(typeof init.body).toBe('string');
	});
});
