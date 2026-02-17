<script lang="ts">
	import type { TaskListItem, TaskDetail } from '$lib/types.js';
	import type { Pagination as PaginationType } from '$lib/types.js';
	import { api } from '$lib/api.js';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import TaskTable from '$lib/components/TaskTable.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import TaskDrawer from '$lib/components/TaskDrawer.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';

	// Filter state
	let filterStatus = $state('');
	let filterType = $state('');
	let filterPriority = $state('');
	let search = $state('');

	// Sort state
	let sort = $state('created_at');
	let order = $state<'asc' | 'desc'>('desc');

	// Pagination state
	let page = $state(1);

	// Data state
	let items = $state<TaskListItem[]>([]);
	let pagination = $state<PaginationType>({ page: 1, limit: 20, total: 0, totalPages: 0 });
	let loading = $state(false);
	let error = $state('');

	// Drawer state
	let selectedTask = $state<TaskDetail | null>(null);

	// Bulk selection state
	let selectedIds = $state<Set<string>>(new Set());

	async function fetchTasks(): Promise<void> {
		loading = true;
		error = '';
		try {
			const params: Record<string, string | number | undefined> = {
				sort,
				order,
				page,
				limit: 20,
			};
			if (filterStatus) params.status = filterStatus;
			if (filterType) params.type = filterType;
			if (filterPriority) params.priority = filterPriority;
			if (search) params.search = search;

			const result = await api.getTasks(params);
			items = result.items;
			pagination = result.pagination;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load tasks';
		} finally {
			loading = false;
		}
	}

	// Refetch when any parameter changes
	$effect(() => {
		// Touch all reactive deps
		filterStatus; filterType; filterPriority; search; sort; order; page;
		fetchTasks();
	});

	function handleFilterChange(filters: { status: string; type: string; priority: string }): void {
		filterStatus = filters.status;
		filterType = filters.type;
		filterPriority = filters.priority;
		page = 1;
		selectedIds = new Set();
	}

	function handleSearchChange(value: string): void {
		search = value;
		page = 1;
		selectedIds = new Set();
	}

	function handleSort(column: string): void {
		if (sort === column) {
			order = order === 'asc' ? 'desc' : 'asc';
		} else {
			sort = column;
			order = column === 'created_at' ? 'desc' : 'asc';
		}
		selectedIds = new Set();
	}

	function handleSelectionChange(ids: Set<string>): void {
		selectedIds = ids;
	}

	async function handleBulkStatusChange(status: string): Promise<void> {
		try {
			await api.bulkUpdateStatus([...selectedIds], status);
			selectedIds = new Set();
			fetchTasks();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Bulk update failed';
		}
	}

	async function handleBulkDelete(): Promise<void> {
		try {
			await api.bulkDeleteTasks([...selectedIds]);
			if (selectedTask && selectedIds.has(selectedTask.id)) {
				selectedTask = null;
			}
			selectedIds = new Set();
			fetchTasks();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Bulk delete failed';
		}
	}

	function handleClearSelection(): void {
		selectedIds = new Set();
	}

	async function handleSelect(id: string): Promise<void> {
		try {
			selectedTask = await api.getTask(id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load task';
		}
	}

	function handleDrawerClose(): void {
		selectedTask = null;
	}

	function handleDrawerUpdated(updated: TaskDetail): void {
		// Update the item in the list optimistically
		items = items.map((item) =>
			item.id === updated.id
				? { ...item, status: updated.status, type: updated.type, priority: updated.priority, updated_at: updated.updated_at }
				: item
		);
		selectedTask = updated;
	}
</script>

<div class="page-header">
	<h1>Tasks</h1>
</div>

<div class="toolbar">
	<FilterBar
		status={filterStatus}
		type={filterType}
		priority={filterPriority}
		onchange={handleFilterChange}
	/>
	<SearchInput value={search} onchange={handleSearchChange} />
</div>

{#if error}
	<div class="error" role="alert">{error}</div>
{/if}

{#if loading && items.length === 0}
	<div class="loading">Loading tasks...</div>
{:else}
	{#if selectedIds.size > 0}
		<BulkActionBar
			selectedCount={selectedIds.size}
			onstatuschange={handleBulkStatusChange}
			ondelete={handleBulkDelete}
			onclear={handleClearSelection}
		/>
	{/if}

	<TaskTable
		{items}
		{sort}
		{order}
		onsort={handleSort}
		onselect={handleSelect}
		{selectedIds}
		onselectionchange={handleSelectionChange}
	/>

	<Pagination {pagination} onchange={(p) => { page = p; }} />
{/if}

{#if selectedTask}
	<TaskDrawer
		task={selectedTask}
		onclose={handleDrawerClose}
		onupdated={handleDrawerUpdated}
	/>
{/if}

<style>
	.page-header {
		margin-bottom: 1.5rem;
	}

	.page-header h1 {
		font-size: 1.5rem;
		font-weight: 600;
	}

	.toolbar {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 1rem;
	}

	.error {
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.loading {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-secondary);
	}
</style>
