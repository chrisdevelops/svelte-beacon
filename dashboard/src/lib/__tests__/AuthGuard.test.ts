import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';
import AuthGuard from '$lib/components/AuthGuard.svelte';

vi.mock('$lib/api.js', () => ({
	api: {
		getSession: vi.fn(),
	},
}));

import { api } from '$lib/api.js';
const mockGetSession = vi.mocked(api.getSession);

// Mock window.location
Object.defineProperty(window, 'location', {
	value: { href: '' },
	writable: true,
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	window.location.href = '';
});

describe('AuthGuard', () => {
	it('shows loading initially', () => {
		mockGetSession.mockImplementation(() => new Promise(() => {}));

		const { container } = render(AuthGuard);
		const loading = container.querySelector('.auth-loading');

		expect(loading).not.toBeNull();
		expect(loading!.textContent).toContain('Checking authentication');
	});

	it('hides loading when authenticated', async () => {
		mockGetSession.mockResolvedValueOnce({
			authenticated: true,
			email: 'user@example.com',
		});

		const { container } = render(AuthGuard);

		await waitFor(() => {
			const loading = container.querySelector('.auth-loading');
			expect(loading).toBeNull();
		});
	});

	it('redirects to login when unauthenticated', async () => {
		mockGetSession.mockResolvedValueOnce({
			authenticated: false,
		});

		render(AuthGuard);

		await waitFor(() => {
			expect(window.location.href).toBe('/__beacon/login');
		});
	});

	it('redirects on API error', async () => {
		mockGetSession.mockRejectedValueOnce(new Error('Network error'));

		render(AuthGuard);

		await waitFor(() => {
			expect(window.location.href).toBe('/__beacon/login');
		});
	});
});
