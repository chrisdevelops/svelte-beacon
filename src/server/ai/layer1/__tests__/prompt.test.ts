import { describe, it, expect } from 'vitest';
import { buildAssistPrompt } from '../prompt.js';
import type { AssistRequest } from '../prompt.js';

function makeRequest(overrides: Partial<AssistRequest> = {}): AssistRequest {
	return {
		description: 'The button is broken',
		type: 'bug',
		priority: 'high',
		...overrides,
	};
}

describe('buildAssistPrompt', () => {
	it('returns an object with system and user strings', () => {
		const result = buildAssistPrompt(makeRequest());
		expect(result).toHaveProperty('system');
		expect(result).toHaveProperty('user');
		expect(typeof result.system).toBe('string');
		expect(typeof result.user).toBe('string');
	});

	it('system prompt mentions all valid types', () => {
		const result = buildAssistPrompt(makeRequest());
		const types = ['bug', 'feature', 'content', 'accessibility', 'performance', 'other'];
		for (const type of types) {
			expect(result.system).toContain(type);
		}
	});

	it('system prompt mentions all valid priorities', () => {
		const result = buildAssistPrompt(makeRequest());
		const priorities = ['low', 'medium', 'high', 'critical'];
		for (const priority of priorities) {
			expect(result.system).toContain(priority);
		}
	});

	it('system prompt asks for raw JSON only', () => {
		const result = buildAssistPrompt(makeRequest());
		expect(result.system).toContain('Return ONLY raw JSON');
	});

	it('user message includes the description', () => {
		const result = buildAssistPrompt(makeRequest({ description: 'Login page crashes on submit' }));
		expect(result.user).toContain('Login page crashes on submit');
	});

	it('user message includes type and priority', () => {
		const result = buildAssistPrompt(makeRequest({ type: 'feature', priority: 'low' }));
		expect(result.user).toContain('Current type: feature');
		expect(result.user).toContain('Current priority: low');
	});

	it('user message includes route when provided', () => {
		const result = buildAssistPrompt(makeRequest({ route: '/dashboard/settings' }));
		expect(result.user).toContain('Page route: /dashboard/settings');
	});

	it('user message excludes route when null', () => {
		const result = buildAssistPrompt(makeRequest({ route: null }));
		expect(result.user).not.toContain('Page route');
	});

	it('user message excludes route when undefined', () => {
		const result = buildAssistPrompt(makeRequest());
		expect(result.user).not.toContain('Page route');
	});

	it('user message includes element_selector when provided', () => {
		const result = buildAssistPrompt(makeRequest({ element_selector: '#submit-btn' }));
		expect(result.user).toContain('Selected element: #submit-btn');
	});

	it('user message excludes element_selector when null', () => {
		const result = buildAssistPrompt(makeRequest({ element_selector: null }));
		expect(result.user).not.toContain('Selected element');
	});

	it('user message includes screenshot note when screenshot_available is true', () => {
		const result = buildAssistPrompt(makeRequest({ screenshot_available: true }));
		expect(result.user).toContain('screenshot was also captured');
	});

	it('user message excludes screenshot note when screenshot_available is false', () => {
		const result = buildAssistPrompt(makeRequest({ screenshot_available: false }));
		expect(result.user).not.toContain('screenshot');
	});

	it('user message excludes screenshot note when screenshot_available is undefined', () => {
		const result = buildAssistPrompt(makeRequest());
		expect(result.user).not.toContain('screenshot');
	});
});
