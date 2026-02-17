import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TaskOverview from '$lib/components/TaskOverview.svelte';
import { createMockTaskDetail } from './factories.js';

afterEach(cleanup);

describe('TaskOverview', () => {
	it('renders status dropdown', () => {
		const task = createMockTaskDetail({ status: 'new' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.querySelector('select')).not.toBeNull();
	});

	it('renders description', () => {
		const task = createMockTaskDetail({ description: 'Test description here' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Test description here');
	});

	it('renders type and priority in metadata', () => {
		const task = createMockTaskDetail({ type: 'feature', priority: 'critical' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('Feature');
		expect(container.textContent).toContain('Critical');
	});

	it('shows route when present', () => {
		const task = createMockTaskDetail({ route: '/dashboard/settings' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('/dashboard/settings');
	});

	it('hides route when null', () => {
		const task = createMockTaskDetail({ route: null });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).not.toContain('Route');
	});

	it('shows email when present', () => {
		const task = createMockTaskDetail({ user_email: 'hello@test.com' });
		const { container } = render(TaskOverview, {
			props: { task, onstatuschange: vi.fn() },
		});
		expect(container.textContent).toContain('hello@test.com');
	});

	it('disables dropdown when updating', () => {
		const task = createMockTaskDetail();
		const { container } = render(TaskOverview, {
			props: { task, updating: true, onstatuschange: vi.fn() },
		});
		const select = container.querySelector('select') as HTMLSelectElement;
		expect(select.disabled).toBe(true);
	});
});
