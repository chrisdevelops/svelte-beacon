<script lang="ts">
	import { TASK_STATUSES, TASK_TYPES, PRIORITY_LEVELS, TYPE_LABELS, PRIORITY_LABELS } from '$lib/types.js';
	import { STATUS_LABELS } from '$lib/status.js';

	let {
		status = '',
		type = '',
		priority = '',
		onchange,
	}: {
		status?: string;
		type?: string;
		priority?: string;
		onchange: (filters: { status: string; type: string; priority: string }) => void;
	} = $props();

	function handleChange(field: 'status' | 'type' | 'priority', value: string): void {
		const next = { status, type, priority };
		next[field] = value;
		onchange(next);
	}
</script>

<div class="filter-bar">
	<select
		value={status}
		onchange={(e) => handleChange('status', e.currentTarget.value)}
		aria-label="Filter by status"
	>
		<option value="">All statuses</option>
		{#each TASK_STATUSES as s}
			<option value={s}>{STATUS_LABELS[s]}</option>
		{/each}
	</select>

	<select
		value={type}
		onchange={(e) => handleChange('type', e.currentTarget.value)}
		aria-label="Filter by type"
	>
		<option value="">All types</option>
		{#each TASK_TYPES as t}
			<option value={t}>{TYPE_LABELS[t]}</option>
		{/each}
	</select>

	<select
		value={priority}
		onchange={(e) => handleChange('priority', e.currentTarget.value)}
		aria-label="Filter by priority"
	>
		<option value="">All priorities</option>
		{#each PRIORITY_LEVELS as p}
			<option value={p}>{PRIORITY_LABELS[p]}</option>
		{/each}
	</select>
</div>

<style>
	.filter-bar {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.875rem;
	}
</style>
