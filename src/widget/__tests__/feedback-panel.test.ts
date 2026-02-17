// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import FeedbackPanel from '../internal/FeedbackPanel.svelte';
import { createWidgetState } from '../internal/shared-state.svelte.js';

const mockFetch = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', mockFetch);
	Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
	Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('FeedbackPanel', () => {
	it('renders form header', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('.beacon-panel-title')?.textContent).toBe('Send feedback');
	});

	it('renders type and priority selectors', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		const labels = container.querySelectorAll('.beacon-label');
		const texts = Array.from(labels).map((l) => l.textContent);
		expect(texts).toContain('Type');
		expect(texts).toContain('Priority');
	});

	it('renders description textarea', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('#beacon-description')).toBeTruthy();
	});

	it('renders submit button', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('.beacon-submit')?.textContent?.trim()).toBe('Submit feedback');
	});

	it('disables submit when description is empty', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		const btn = container.querySelector('.beacon-submit') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('enables submit when description has content', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.description = 'Something is broken';
		});
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		const btn = container.querySelector('.beacon-submit') as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
	});

	it('does not show email field by default', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('#beacon-email')).toBeNull();
	});

	it('shows email field when requireEmail is true', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.setConfig({
				screenshot: false,
				elementSelector: false,
				aiAssist: false,
				requireEmail: true,
				position: 'bottom-right',
			});
			state.open();
		});
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('#beacon-email')).toBeTruthy();
	});

	it('shows success view after successful submission', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.setResult({ ok: true, data: { id: 'abc', public_id: 5 } });
		});
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('.beacon-message--success')).toBeTruthy();
		expect(container.querySelector('.beacon-message-text')?.textContent).toBe('Feedback submitted as #5');
	});

	it('shows error view after failed submission', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.setResult({ ok: false, error: 'Server exploded' });
		});
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('.beacon-message--error')).toBeTruthy();
		expect(container.querySelector('.beacon-message-text')?.textContent).toBe('Server exploded');
	});

	it('has dialog role', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('[role="dialog"]')).toBeTruthy();
	});

	it('renders close button', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		const { container } = render(FeedbackPanel, { props: { ws: state } });
		expect(container.querySelector('.beacon-panel-close')).toBeTruthy();
	});
});
