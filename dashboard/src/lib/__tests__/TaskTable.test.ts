import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import TaskTable from '$lib/components/TaskTable.svelte';
import { createMockTaskListItem } from './factories.js';

afterEach(cleanup);

describe('TaskTable', () => {
	it('renders empty state when no items', () => {
		const { container } = render(TaskTable, {
			props: { items: [], onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.textContent).toContain('No tasks found');
	});

	it('does not render table when no items', () => {
		const { container } = render(TaskTable, {
			props: { items: [], onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.querySelector('table')).toBeNull();
	});

	it('renders table with items', () => {
		const items = [createMockTaskListItem(), createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		const rows = container.querySelectorAll('tbody tr');
		expect(rows).toHaveLength(2);
	});

	it('displays task public_id', () => {
		const items = [createMockTaskListItem({ public_id: 42 })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.textContent).toContain('42');
	});

	it('displays truncated description', () => {
		const desc = 'A'.repeat(100);
		const items = [createMockTaskListItem({ description: desc })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		const descCol = container.querySelector('.desc-col');
		expect(descCol!.textContent!.length).toBeLessThan(100);
	});

	it('shows sort indicator for active column', () => {
		const items = [createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, sort: 'created_at', order: 'desc', onsort: vi.fn(), onselect: vi.fn() },
		});
		// The Created header should have a down arrow
		const headers = container.querySelectorAll('th');
		const createdHeader = Array.from(headers).find((h) => h.textContent?.includes('Created'));
		expect(createdHeader?.textContent).toContain('\u2193');
	});

	it('shows ascending indicator', () => {
		const items = [createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, sort: 'public_id', order: 'asc', onsort: vi.fn(), onselect: vi.fn() },
		});
		const headers = container.querySelectorAll('th');
		const idHeader = headers[0];
		expect(idHeader?.textContent).toContain('\u2191');
	});

	it('calls onsort when clicking sortable header', () => {
		const onsort = vi.fn();
		const items = [createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, onsort, onselect: vi.fn() },
		});
		const sortableHeaders = container.querySelectorAll('th.sortable');
		(sortableHeaders[0] as HTMLElement).click();
		expect(onsort).toHaveBeenCalledWith('public_id');
	});

	it('calls onselect when clicking row', () => {
		const onselect = vi.fn();
		const items = [createMockTaskListItem({ id: 'task-abc' })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect },
		});
		const row = container.querySelector('tbody tr') as HTMLElement;
		row.click();
		expect(onselect).toHaveBeenCalledWith('task-abc');
	});

	it('renders status badges', () => {
		const items = [createMockTaskListItem({ status: 'blocked' })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.textContent).toContain('Blocked');
	});

	it('renders priority badges', () => {
		const items = [createMockTaskListItem({ priority: 'critical' })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.textContent).toContain('Critical');
	});

	it('renders type badges', () => {
		const items = [createMockTaskListItem({ type: 'feature' })];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.textContent).toContain('Feature');
	});

	it('does not render checkboxes when onselectionchange not provided', () => {
		const items = [createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn() },
		});
		expect(container.querySelector('input[type="checkbox"]')).toBeNull();
	});

	it('renders checkboxes when onselectionchange provided', () => {
		const items = [createMockTaskListItem()];
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn(), selectedIds: new Set(), onselectionchange: vi.fn() },
		});
		const checkboxes = container.querySelectorAll('input[type="checkbox"]');
		// 1 header + 1 row
		expect(checkboxes.length).toBe(2);
	});

	it('calls onselectionchange with item id when row checkbox toggled', () => {
		const items = [createMockTaskListItem({ id: 'task-toggle' })];
		const onselectionchange = vi.fn();
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn(), selectedIds: new Set(), onselectionchange },
		});
		const rowCheckbox = container.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;
		rowCheckbox.click();
		expect(onselectionchange).toHaveBeenCalled();
		const newSet = onselectionchange.mock.calls[0][0] as Set<string>;
		expect(newSet.has('task-toggle')).toBe(true);
	});

	it('calls onselectionchange to select all when header checkbox clicked', () => {
		const items = [
			createMockTaskListItem({ id: 'task-a' }),
			createMockTaskListItem({ id: 'task-b' }),
		];
		const onselectionchange = vi.fn();
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect: vi.fn(), selectedIds: new Set(), onselectionchange },
		});
		const headerCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
		headerCheckbox.click();
		expect(onselectionchange).toHaveBeenCalled();
		const newSet = onselectionchange.mock.calls[0][0] as Set<string>;
		expect(newSet.has('task-a')).toBe(true);
		expect(newSet.has('task-b')).toBe(true);
	});

	it('checkbox click does not trigger onselect', () => {
		const items = [createMockTaskListItem()];
		const onselect = vi.fn();
		const { container } = render(TaskTable, {
			props: { items, onsort: vi.fn(), onselect, selectedIds: new Set(), onselectionchange: vi.fn() },
		});
		const rowCheckbox = container.querySelectorAll('input[type="checkbox"]')[1] as HTMLInputElement;
		rowCheckbox.click();
		expect(onselect).not.toHaveBeenCalled();
	});
});
