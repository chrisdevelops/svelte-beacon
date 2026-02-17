// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FloatingButton from '../internal/FloatingButton.svelte';

afterEach(() => cleanup());

describe('FloatingButton', () => {
	it('renders a button', () => {
		const { container } = render(FloatingButton, { props: { open: false, onclick: vi.fn() } });
		expect(container.querySelector('button')).toBeTruthy();
	});

	it('has correct aria-label when closed', () => {
		const { container } = render(FloatingButton, { props: { open: false, onclick: vi.fn() } });
		const btn = container.querySelector('button')!;
		expect(btn.getAttribute('aria-label')).toBe('Send feedback');
	});

	it('has correct aria-label when open', () => {
		const { container } = render(FloatingButton, { props: { open: true, onclick: vi.fn() } });
		const btn = container.querySelector('button')!;
		expect(btn.getAttribute('aria-label')).toBe('Close feedback');
	});

	it('has aria-expanded false when closed', () => {
		const { container } = render(FloatingButton, { props: { open: false, onclick: vi.fn() } });
		const btn = container.querySelector('button')!;
		expect(btn.getAttribute('aria-expanded')).toBe('false');
	});

	it('has aria-expanded true when open', () => {
		const { container } = render(FloatingButton, { props: { open: true, onclick: vi.fn() } });
		const btn = container.querySelector('button')!;
		expect(btn.getAttribute('aria-expanded')).toBe('true');
	});

	it('calls onclick on click', () => {
		const onclick = vi.fn();
		const { container } = render(FloatingButton, { props: { open: false, onclick } });
		container.querySelector('button')!.click();
		expect(onclick).toHaveBeenCalledOnce();
	});

	it('renders svg icon when closed', () => {
		const { container } = render(FloatingButton, { props: { open: false, onclick: vi.fn() } });
		const svg = container.querySelector('button svg');
		expect(svg).toBeTruthy();
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders svg icon when open', () => {
		const { container } = render(FloatingButton, { props: { open: true, onclick: vi.fn() } });
		const svg = container.querySelector('button svg');
		expect(svg).toBeTruthy();
	});
});
