import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import LoginForm from '$lib/components/LoginForm.svelte';

vi.mock('$lib/api.js', () => ({
	api: {
		requestMagicLink: vi.fn(),
	},
}));

import { api } from '$lib/api.js';
const mockRequestMagicLink = vi.mocked(api.requestMagicLink);

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('LoginForm', () => {
	it('renders email input and submit button', () => {
		const { container } = render(LoginForm);
		const input = container.querySelector('input[type="email"]');
		const button = container.querySelector('button[type="submit"]');

		expect(input).not.toBeNull();
		expect(button).not.toBeNull();
		expect(button!.textContent).toContain('Send magic link');
	});

	it('shows success message after submission', async () => {
		mockRequestMagicLink.mockResolvedValueOnce(undefined);

		const { container } = render(LoginForm);
		const input = container.querySelector('input[type="email"]') as HTMLInputElement;
		const form = container.querySelector('form')!;

		await fireEvent.input(input, { target: { value: 'user@example.com' } });
		await fireEvent.submit(form);

		// Wait for async operation
		await vi.waitFor(() => {
			const success = container.querySelector('[role="status"]');
			expect(success).not.toBeNull();
			expect(success!.textContent).toContain('Check your server console');
		});
	});

	it('shows error on failure', async () => {
		mockRequestMagicLink.mockRejectedValueOnce(new Error('Network error'));

		const { container } = render(LoginForm);
		const input = container.querySelector('input[type="email"]') as HTMLInputElement;
		const form = container.querySelector('form')!;

		await fireEvent.input(input, { target: { value: 'user@example.com' } });
		await fireEvent.submit(form);

		await vi.waitFor(() => {
			const errorEl = container.querySelector('[role="alert"]');
			expect(errorEl).not.toBeNull();
			expect(errorEl!.textContent).toContain('Network error');
		});
	});

	it('disables form during submission', async () => {
		let resolvePromise: () => void;
		mockRequestMagicLink.mockImplementation(
			() => new Promise<void>((resolve) => { resolvePromise = resolve; }),
		);

		const { container } = render(LoginForm);
		const input = container.querySelector('input[type="email"]') as HTMLInputElement;
		const form = container.querySelector('form')!;

		await fireEvent.input(input, { target: { value: 'user@example.com' } });
		await fireEvent.submit(form);

		// During submission, both input and button should be disabled
		await vi.waitFor(() => {
			const btn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
			expect(btn.disabled).toBe(true);
			expect(btn.textContent).toContain('Sending...');
		});

		resolvePromise!();
	});
});
