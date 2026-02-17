import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ActivityTab from '$lib/components/ActivityTab.svelte';
import { createMockTaskDetail, createMockActivity } from './factories.js';

afterEach(cleanup);

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
});
