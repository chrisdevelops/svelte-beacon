<script lang="ts">
	import { TASK_STATUSES } from '$lib/types.js';
	import { STATUS_LABELS } from '$lib/status.js';

	let {
		selectedCount,
		onstatuschange,
		ondelete,
		onclear,
	}: {
		selectedCount: number;
		onstatuschange: (status: string) => void;
		ondelete: () => void;
		onclear: () => void;
	} = $props();

	let selectedStatus = $state('');

	function handleStatusChange(): void {
		if (selectedStatus) {
			onstatuschange(selectedStatus);
			selectedStatus = '';
		}
	}
</script>

<div class="bulk-bar">
	<span class="count">{selectedCount} selected</span>

	<div class="actions">
		<select bind:value={selectedStatus} onchange={handleStatusChange} aria-label="Change status">
			<option value="">Change status...</option>
			{#each TASK_STATUSES as status}
				<option value={status}>{STATUS_LABELS[status]}</option>
			{/each}
		</select>

		<button class="delete-btn" onclick={ondelete}>Delete</button>
		<button class="clear-btn" onclick={onclear}>Clear</button>
	</div>
</div>

<style>
	.bulk-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.75rem 1rem;
		background: color-mix(in srgb, var(--color-accent) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
		border-radius: var(--radius);
		margin-bottom: 1rem;
	}

	.count {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.8125rem;
	}

	.delete-btn {
		padding: 0.375rem 0.75rem;
		background: #ef4444;
		color: white;
		border: none;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
	}

	.delete-btn:hover {
		background: #dc2626;
	}

	.clear-btn {
		padding: 0.375rem 0.75rem;
		background: transparent;
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.8125rem;
		cursor: pointer;
	}

	.clear-btn:hover {
		color: var(--color-text);
	}
</style>
