<script lang="ts">
	import type { TaskListItem } from '$lib/types.js';
	import StatusBadge from './StatusBadge.svelte';
	import PriorityBadge from './PriorityBadge.svelte';
	import TypeBadge from './TypeBadge.svelte';
	import { truncate, formatRelativeTime } from '$lib/format.js';

	let {
		items,
		sort = 'created_at',
		order = 'desc' as 'asc' | 'desc',
		onsort,
		onselect,
		selectedIds,
		onselectionchange,
	}: {
		items: TaskListItem[];
		sort?: string;
		order?: 'asc' | 'desc';
		onsort: (column: string) => void;
		onselect: (id: string) => void;
		selectedIds?: Set<string>;
		onselectionchange?: (ids: Set<string>) => void;
	} = $props();

	const selectable = $derived(!!onselectionchange);
	const allSelected = $derived(selectable && items.length > 0 && items.every(item => selectedIds?.has(item.id)));
	const someSelected = $derived(selectable && items.some(item => selectedIds?.has(item.id)) && !allSelected);

	function handleSelectAll(): void {
		if (!onselectionchange) return;
		if (allSelected) {
			onselectionchange(new Set());
		} else {
			onselectionchange(new Set(items.map(item => item.id)));
		}
	}

	function handleToggleItem(e: Event, id: string): void {
		e.stopPropagation();
		if (!onselectionchange || !selectedIds) return;
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		onselectionchange(next);
	}

	const SORTABLE = ['public_id', 'priority', 'created_at'] as const;

	function isSortable(col: string): boolean {
		return (SORTABLE as readonly string[]).includes(col);
	}

	function sortIndicator(col: string): string {
		if (sort !== col) return '';
		return order === 'asc' ? ' \u2191' : ' \u2193';
	}

	function handleHeaderClick(col: string): void {
		if (isSortable(col)) onsort(col);
	}

	function handleKeydown(e: KeyboardEvent, id: string): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect(id);
		}
	}
</script>

{#if items.length === 0}
	<div class="empty">
		<p>No tasks found</p>
	</div>
{:else}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					{#if selectable}
						<th class="check-col">
							<input
								type="checkbox"
								checked={allSelected}
								indeterminate={someSelected}
								onchange={handleSelectAll}
								aria-label="Select all"
							/>
						</th>
					{/if}
					<th
						class="sortable"
						onclick={() => handleHeaderClick('public_id')}
						aria-sort={sort === 'public_id' ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
					>
						#{sortIndicator('public_id')}
					</th>
					<th>Description</th>
					<th>Type</th>
					<th
						class="sortable"
						onclick={() => handleHeaderClick('priority')}
						aria-sort={sort === 'priority' ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
					>
						Priority{sortIndicator('priority')}
					</th>
					<th>Status</th>
					<th
						class="sortable"
						onclick={() => handleHeaderClick('created_at')}
						aria-sort={sort === 'created_at' ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
					>
						Created{sortIndicator('created_at')}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					<tr
						onclick={() => onselect(item.id)}
						onkeydown={(e) => handleKeydown(e, item.id)}
						tabindex="0"
						role="button"
					>
						{#if selectable}
							<td class="check-col">
								<input
									type="checkbox"
									checked={selectedIds?.has(item.id) ?? false}
									onchange={(e) => handleToggleItem(e, item.id)}
									onclick={(e) => e.stopPropagation()}
									aria-label="Select task {item.public_id}"
								/>
							</td>
						{/if}
						<td class="id-col">{item.public_id}</td>
						<td class="desc-col">{truncate(item.description, 80)}</td>
						<td><TypeBadge type={item.type} /></td>
						<td><PriorityBadge priority={item.priority} /></td>
						<td><StatusBadge status={item.status} /></td>
						<td class="date-col">{formatRelativeTime(item.created_at)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.empty {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-text-secondary);
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead {
		border-bottom: 2px solid var(--color-border);
	}

	th {
		text-align: left;
		padding: 0.5rem 0.75rem;
		color: var(--color-text-secondary);
		font-weight: 500;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		white-space: nowrap;
		user-select: none;
	}

	th.sortable {
		cursor: pointer;
	}

	th.sortable:hover {
		color: var(--color-text);
	}

	td {
		padding: 0.625rem 0.75rem;
		border-bottom: 1px solid var(--color-border);
	}

	tbody tr {
		cursor: pointer;
	}

	tbody tr:hover {
		background: var(--color-bg-secondary);
	}

	tbody tr:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.id-col {
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.desc-col {
		max-width: 400px;
	}

	.date-col {
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.check-col {
		width: 2.5rem;
		text-align: center;
	}

	.check-col input[type="checkbox"] {
		cursor: pointer;
	}
</style>
