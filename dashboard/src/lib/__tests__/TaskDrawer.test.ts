import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TaskDrawer from '$lib/components/TaskDrawer.svelte';
import { createMockTaskDetail, createMockActivity, createMockAdminNote } from './factories.js';
import type { TaskDetail } from '$lib/types.js';

// Mock the api module
vi.mock('$lib/api.js', () => ({
	api: {
		updateTask: vi.fn(),
	},
}));

// Mock auth context — default to admin
const mockAuthContext = { isAdmin: true };
vi.mock('$lib/auth-context.js', () => ({
	getAuthContext: () => mockAuthContext,
}));

afterEach(cleanup);

describe('TaskDrawer', () => {
	let task: TaskDetail;

	beforeEach(() => {
		mockAuthContext.isAdmin = true;
		task = createMockTaskDetail({
			public_id: 42,
			description: 'Fix the login bug',
			type: 'bug',
			priority: 'high',
			status: 'new',
			route: '/login',
			user_email: 'user@test.com',
		});
	});

	it('renders task header with public_id', () => {
		const { container } = render(TaskDrawer, {
			props: { task, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Task #42');
	});

	it('renders close button', () => {
		const { container } = render(TaskDrawer, {
			props: { task, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.querySelector('[aria-label="Close drawer"]')).not.toBeNull();
	});

	it('calls onclose when close button clicked', () => {
		const onclose = vi.fn();
		const { container } = render(TaskDrawer, {
			props: { task, onclose, onupdated: vi.fn() },
		});
		const closeBtn = container.querySelector('[aria-label="Close drawer"]') as HTMLButtonElement;
		closeBtn.click();
		expect(onclose).toHaveBeenCalled();
	});

	it('calls onclose when backdrop clicked', () => {
		const onclose = vi.fn();
		const { container } = render(TaskDrawer, {
			props: { task, onclose, onupdated: vi.fn() },
		});
		const backdrop = container.querySelector('.backdrop') as HTMLElement;
		backdrop.click();
		expect(onclose).toHaveBeenCalled();
	});

	it('renders description', () => {
		const { container } = render(TaskDrawer, {
			props: { task, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Fix the login bug');
	});

	it('renders metadata', () => {
		const { container } = render(TaskDrawer, {
			props: { task, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Bug');
		expect(container.textContent).toContain('High');
		expect(container.textContent).toContain('/login');
		expect(container.textContent).toContain('user@test.com');
	});

	it('renders Notes tab with count', () => {
		const taskWithNotes = createMockTaskDetail({
			admin_notes: [createMockAdminNote()],
		});
		const { container } = render(TaskDrawer, {
			props: { task: taskWithNotes, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Notes');
	});

	it('renders Activity tab with count', () => {
		const taskWithActivity = createMockTaskDetail({
			activity: [createMockActivity()],
		});
		const { container } = render(TaskDrawer, {
			props: { task: taskWithActivity, onclose: vi.fn(), onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Activity');
	});

	describe('AI Status tab visibility', () => {
		it('shows AI Status tab for admin users', () => {
			mockAuthContext.isAdmin = true;
			const { container } = render(TaskDrawer, {
				props: { task, onclose: vi.fn(), onupdated: vi.fn() },
			});
			expect(container.textContent).toContain('AI Status');
		});

		it('hides AI Status tab for non-admin users', () => {
			mockAuthContext.isAdmin = false;
			const { container } = render(TaskDrawer, {
				props: { task, onclose: vi.fn(), onupdated: vi.fn() },
			});
			expect(container.textContent).not.toContain('AI Status');
		});
	});
});
