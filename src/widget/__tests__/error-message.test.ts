// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ErrorMessage from '../internal/ErrorMessage.svelte';

afterEach(() => cleanup());

describe('ErrorMessage', () => {
	it('renders error title', () => {
		const { container } = render(ErrorMessage, {
			props: { error: 'Server error', onretry: vi.fn(), ondismiss: vi.fn() },
		});
		expect(container.querySelector('.beacon-message-title')?.textContent).toBe('Something went wrong');
	});

	it('renders error message', () => {
		const { container } = render(ErrorMessage, {
			props: { error: 'Request timed out', onretry: vi.fn(), ondismiss: vi.fn() },
		});
		expect(container.querySelector('.beacon-message-text')?.textContent).toBe('Request timed out');
	});

	it('renders retry and dismiss buttons', () => {
		const { container } = render(ErrorMessage, {
			props: { error: 'Error', onretry: vi.fn(), ondismiss: vi.fn() },
		});
		const buttons = container.querySelectorAll('.beacon-message-actions button');
		const texts = Array.from(buttons).map((b) => b.textContent);
		expect(texts).toContain('Try again');
		expect(texts).toContain('Dismiss');
	});

	it('calls onretry when Try again is clicked', () => {
		const onretry = vi.fn();
		const { container } = render(ErrorMessage, {
			props: { error: 'Error', onretry, ondismiss: vi.fn() },
		});
		const btn = container.querySelector('.beacon-btn-primary') as HTMLElement;
		btn.click();
		expect(onretry).toHaveBeenCalledOnce();
	});

	it('calls ondismiss when Dismiss is clicked', () => {
		const ondismiss = vi.fn();
		const { container } = render(ErrorMessage, {
			props: { error: 'Error', onretry: vi.fn(), ondismiss },
		});
		const btn = container.querySelector('.beacon-btn-secondary') as HTMLElement;
		btn.click();
		expect(ondismiss).toHaveBeenCalledOnce();
	});

	it('renders field errors when provided', () => {
		const { container } = render(ErrorMessage, {
			props: {
				error: 'Validation failed',
				fields: { description: 'Required', email: 'Invalid format' },
				onretry: vi.fn(),
				ondismiss: vi.fn(),
			},
		});
		const errors = container.querySelectorAll('.beacon-field-errors li');
		expect(errors).toHaveLength(2);
		const texts = Array.from(errors).map((li) => li.textContent);
		expect(texts.some((t) => t?.includes('description: Required'))).toBe(true);
		expect(texts.some((t) => t?.includes('email: Invalid format'))).toBe(true);
	});

	it('does not render field errors list when none provided', () => {
		const { container } = render(ErrorMessage, {
			props: { error: 'Error', onretry: vi.fn(), ondismiss: vi.fn() },
		});
		expect(container.querySelector('.beacon-field-errors')).toBeNull();
	});
});
