import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ActivityTab from '$lib/components/ActivityTab.svelte';
import { createMockTaskDetail, createMockActivity } from './factories.js';

// Mock auth context — default to admin
const mockAuthContext = { isAdmin: true };
vi.mock('$lib/auth-context.js', () => ({
	getAuthContext: () => mockAuthContext,
}));

afterEach(cleanup);

beforeEach(() => {
	mockAuthContext.isAdmin = true;
});

describe('ActivityTab', () => {
	it('renders empty state when no activity', () => {
		const task = createMockTaskDetail({ activity: [] });
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.textContent).toContain('No activity recorded yet');
	});

	it('renders activity entries', () => {
		const task = createMockTaskDetail({
			activity: [createMockActivity()],
		});
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.querySelectorAll('.activity-item')).toHaveLength(1);
	});

	it('renders actor names', () => {
		const task = createMockTaskDetail({
			activity: [createMockActivity({ actor: 'admin' })],
		});
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.textContent).toContain('admin');
	});

	it('renders status change descriptions with labels', () => {
		const task = createMockTaskDetail({
			activity: [createMockActivity({ action: 'status_change', old_value: 'new', new_value: 'backlog' })],
		});
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.textContent).toContain('New');
		expect(container.textContent).toContain('Backlog');
		expect(container.textContent).toContain('changed status from');
	});

	it('renders non-status-change actions', () => {
		const task = createMockTaskDetail({
			activity: [createMockActivity({ action: 'created' })],
		});
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.textContent).toContain('created');
	});

	it('hides empty state when activity exists', () => {
		const task = createMockTaskDetail({
			activity: [createMockActivity()],
		});
		const { container } = render(ActivityTab, {
			props: { task },
		});
		expect(container.textContent).not.toContain('No activity recorded yet');
	});

	describe('AI activity filtering', () => {
		it('shows AI actor entries for admin users', () => {
			mockAuthContext.isAdmin = true;
			const task = createMockTaskDetail({
				activity: [
					createMockActivity({ actor: 'ai', action: 'status_change', old_value: 'new', new_value: 'in_progress' }),
					createMockActivity({ actor: 'user', action: 'created' }),
				],
			});
			const { container } = render(ActivityTab, {
				props: { task },
			});
			expect(container.querySelectorAll('.activity-item')).toHaveLength(2);
			expect(container.textContent).toContain('ai');
		});

		it('hides AI actor entries for non-admin users', () => {
			mockAuthContext.isAdmin = false;
			const task = createMockTaskDetail({
				activity: [
					createMockActivity({ actor: 'ai', action: 'status_change', old_value: 'new', new_value: 'in_progress' }),
					createMockActivity({ actor: 'user', action: 'created' }),
				],
			});
			const { container } = render(ActivityTab, {
				props: { task },
			});
			expect(container.querySelectorAll('.activity-item')).toHaveLength(1);
			expect(container.textContent).not.toContain('ai');
		});

		it('shows empty state when all activity is from AI and user is non-admin', () => {
			mockAuthContext.isAdmin = false;
			const task = createMockTaskDetail({
				activity: [
					createMockActivity({ actor: 'ai', action: 'status_change', old_value: 'new', new_value: 'in_progress' }),
				],
			});
			const { container } = render(ActivityTab, {
				props: { task },
			});
			expect(container.textContent).toContain('No activity recorded yet');
		});

		it('preserves system actor entries for non-admin users', () => {
			mockAuthContext.isAdmin = false;
			const task = createMockTaskDetail({
				activity: [
					createMockActivity({ actor: 'system', action: 'created' }),
					createMockActivity({ actor: 'ai', action: 'status_change', old_value: 'new', new_value: 'in_progress' }),
				],
			});
			const { container } = render(ActivityTab, {
				props: { task },
			});
			expect(container.querySelectorAll('.activity-item')).toHaveLength(1);
			expect(container.textContent).toContain('system');
		});
	});
});
