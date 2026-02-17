<script lang="ts">
	import type { TaskStatus } from '$lib/types.js';
	import { STATUS_LABELS, getValidTransitions } from '$lib/status.js';

	let {
		current,
		onchange,
		disabled = false,
	}: {
		current: TaskStatus;
		onchange: (status: TaskStatus) => void;
		disabled?: boolean;
	} = $props();

	let transitions = $derived(getValidTransitions(current));
</script>

<select
	value={current}
	{disabled}
	onchange={(e) => {
		const target = e.currentTarget;
		const value = target.value as TaskStatus;
		if (value !== current) {
			onchange(value);
		}
	}}
>
	<option value={current}>{STATUS_LABELS[current]}</option>
	{#each transitions as status}
		<option value={status}>{STATUS_LABELS[status]}</option>
	{/each}
</select>

<style>
	select {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.875rem;
		cursor: pointer;
	}

	select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
