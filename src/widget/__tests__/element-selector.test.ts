// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import {
	generateCssSelector,
	getElementLabel,
	startSelection,
} from '../internal/element-selector.js';
import ElementSelector from '../internal/ElementSelector.svelte';
import { createWidgetState } from '../internal/shared-state.svelte.js';

afterEach(() => {
	cleanup();
});

// --------------------------------------------------------------------------
// generateCssSelector
// --------------------------------------------------------------------------

describe('generateCssSelector', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('returns #id when element has a unique id', () => {
		const el = document.createElement('button');
		el.id = 'submit-btn';
		document.body.appendChild(el);
		expect(generateCssSelector(el)).toBe('#submit-btn');
	});

	it('returns [data-testid] when element has data-testid', () => {
		const el = document.createElement('div');
		el.setAttribute('data-testid', 'my-component');
		document.body.appendChild(el);
		expect(generateCssSelector(el)).toBe('[data-testid="my-component"]');
	});

	it('prefers #id over data-testid', () => {
		const el = document.createElement('div');
		el.id = 'unique-el';
		el.setAttribute('data-testid', 'my-component');
		document.body.appendChild(el);
		expect(generateCssSelector(el)).toBe('#unique-el');
	});

	it('generates nth-child path when no id or testid', () => {
		const container = document.createElement('div');
		const child1 = document.createElement('span');
		const child2 = document.createElement('button');
		container.appendChild(child1);
		container.appendChild(child2);
		document.body.appendChild(container);

		const selector = generateCssSelector(child2);
		expect(selector).toContain('nth-child');
		expect(selector).toContain('button');
		// Validate the selector resolves to the correct element
		const found = document.querySelector(selector);
		expect(found).toBe(child2);
	});

	it('caps path at 5 segments', () => {
		// Build a deeply nested DOM: body > div > div > div > div > div > div > div > span
		let current: HTMLElement = document.body;
		for (let i = 0; i < 7; i++) {
			const child = document.createElement('div');
			current.appendChild(child);
			current = child;
		}
		const leaf = document.createElement('span');
		current.appendChild(leaf);

		const selector = generateCssSelector(leaf);
		const segments = selector.replace('body > ', '').split(' > ');
		expect(segments.length).toBeLessThanOrEqual(5);
	});

	it('falls back to nth-child when id is not unique', () => {
		const el1 = document.createElement('div');
		el1.id = 'dup';
		document.body.appendChild(el1);
		const el2 = document.createElement('div');
		el2.id = 'dup';
		document.body.appendChild(el2);

		const selector = generateCssSelector(el2);
		// Should not use #dup since it's not unique
		expect(selector).not.toBe('#dup');
		expect(selector).toContain('nth-child');
	});
});

// --------------------------------------------------------------------------
// getElementLabel
// --------------------------------------------------------------------------

describe('getElementLabel', () => {
	it('returns tag name for bare element', () => {
		const el = document.createElement('section');
		expect(getElementLabel(el)).toBe('section');
	});

	it('includes id when present', () => {
		const el = document.createElement('div');
		el.id = 'main';
		expect(getElementLabel(el)).toBe('div#main');
	});

	it('includes first class when no id', () => {
		const el = document.createElement('button');
		el.classList.add('primary', 'large');
		expect(getElementLabel(el)).toBe('button.primary');
	});

	it('prefers id over class', () => {
		const el = document.createElement('div');
		el.id = 'hero';
		el.classList.add('section');
		expect(getElementLabel(el)).toBe('div#hero');
	});
});

// --------------------------------------------------------------------------
// startSelection
// --------------------------------------------------------------------------

describe('startSelection', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('creates overlay element in the document body', () => {
		const cleanupFn = startSelection({
			onSelect: vi.fn(),
			onCancel: vi.fn(),
		});

		const overlay = document.querySelector('[data-beacon-selector-overlay]');
		expect(overlay).toBeTruthy();
		expect(overlay).toBeInstanceOf(HTMLDivElement);

		cleanupFn();
	});

	it('overlay has correct inline styles', () => {
		const cleanupFn = startSelection({
			onSelect: vi.fn(),
			onCancel: vi.fn(),
		});

		const overlay = document.querySelector('[data-beacon-selector-overlay]') as HTMLDivElement;
		expect(overlay.style.position).toBe('fixed');
		expect(overlay.style.pointerEvents).toBe('none');
		expect(overlay.style.zIndex).toBe('2147483646');

		cleanupFn();
	});

	it('cleanup removes overlay and event listeners', () => {
		const cleanupFn = startSelection({
			onSelect: vi.fn(),
			onCancel: vi.fn(),
		});

		expect(document.querySelector('[data-beacon-selector-overlay]')).toBeTruthy();

		cleanupFn();

		expect(document.querySelector('[data-beacon-selector-overlay]')).toBeNull();
	});

	it('calls onCancel when Escape is pressed', () => {
		const onCancel = vi.fn();
		const cleanupFn = startSelection({
			onSelect: vi.fn(),
			onCancel,
		});

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(onCancel).toHaveBeenCalledOnce();
		// Overlay should be removed after cancel
		expect(document.querySelector('[data-beacon-selector-overlay]')).toBeNull();

		// Cleanup is idempotent
		cleanupFn();
	});

	it('calls onSelect when an element is clicked', () => {
		const target = document.createElement('button');
		target.id = 'click-target';
		document.body.appendChild(target);

		const onSelect = vi.fn();
		startSelection({
			onSelect,
			onCancel: vi.fn(),
		});

		// Simulate mousemove to set currentTarget
		// jsdom doesn't support elementFromPoint natively, so we need to stub it
		const originalElementFromPoint = document.elementFromPoint;
		document.elementFromPoint = vi.fn().mockReturnValue(target);

		document.dispatchEvent(new MouseEvent('mousemove', {
			clientX: 50,
			clientY: 50,
			bubbles: true,
		}));

		// Now click
		document.dispatchEvent(new MouseEvent('click', {
			clientX: 50,
			clientY: 50,
			bubbles: true,
		}));

		expect(onSelect).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenCalledWith('#click-target', 'button#click-target');

		// Overlay should be removed after selection
		expect(document.querySelector('[data-beacon-selector-overlay]')).toBeNull();

		document.elementFromPoint = originalElementFromPoint;
	});

	it('ignores elements inside ignoreElement', () => {
		const host = document.createElement('div');
		const child = document.createElement('span');
		host.appendChild(child);
		document.body.appendChild(host);

		const onSelect = vi.fn();
		const cleanupFn = startSelection({
			ignoreElement: host,
			onSelect,
			onCancel: vi.fn(),
		});

		const originalElementFromPoint = document.elementFromPoint;
		document.elementFromPoint = vi.fn().mockReturnValue(child);

		document.dispatchEvent(new MouseEvent('mousemove', {
			clientX: 50,
			clientY: 50,
			bubbles: true,
		}));

		// Click should not trigger onSelect for an ignored element
		document.dispatchEvent(new MouseEvent('click', {
			clientX: 50,
			clientY: 50,
			bubbles: true,
		}));

		expect(onSelect).not.toHaveBeenCalled();

		document.elementFromPoint = originalElementFromPoint;
		cleanupFn();
	});
});

// --------------------------------------------------------------------------
// ElementSelector component
// --------------------------------------------------------------------------

describe('ElementSelector', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders "Select element" button in idle state', () => {
		const ws = createWidgetState();
		const { container } = render(ElementSelector, {
			props: { ws, hostElement: null },
		});
		const btn = container.querySelector('.beacon-element-btn');
		expect(btn).toBeTruthy();
		expect(btn?.textContent).toContain('Select element');
	});

	it('shows selected element badge when element is set', () => {
		const ws = createWidgetState();
		flushSync(() => {
			ws.startElementSelection();
			ws.finishElementSelection('#my-button');
		});
		const { container } = render(ElementSelector, {
			props: { ws, hostElement: null },
		});
		const badge = container.querySelector('.beacon-element-badge');
		expect(badge).toBeTruthy();
		const badgeText = container.querySelector('.beacon-element-badge-text');
		expect(badgeText?.textContent).toBe('#my-button');
	});

	it('shows Change and Clear buttons when element is selected', () => {
		const ws = createWidgetState();
		flushSync(() => {
			ws.startElementSelection();
			ws.finishElementSelection('div.main');
		});
		const { container } = render(ElementSelector, {
			props: { ws, hostElement: null },
		});
		const buttons = container.querySelectorAll('.beacon-element-action-btn');
		expect(buttons.length).toBe(2);
		expect(buttons[0]?.textContent?.trim()).toBe('Change');
		expect(buttons[1]?.textContent?.trim()).toBe('Clear');
	});

	it('clears element when Clear is clicked', () => {
		const ws = createWidgetState();
		flushSync(() => {
			ws.startElementSelection();
			ws.finishElementSelection('#foo');
		});
		const { container } = render(ElementSelector, {
			props: { ws, hostElement: null },
		});

		const clearBtn = container.querySelectorAll('.beacon-element-action-btn')[1] as HTMLButtonElement;
		clearBtn.click();

		// selectedElement should be empty string (treated as no selection)
		expect(ws.selectedElement).toBe('');
	});

	it('disables button when submitting', () => {
		const ws = createWidgetState();
		flushSync(() => ws.setSubmitting(true));
		const { container } = render(ElementSelector, {
			props: { ws, hostElement: null },
		});
		const btn = container.querySelector('.beacon-element-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});
});
