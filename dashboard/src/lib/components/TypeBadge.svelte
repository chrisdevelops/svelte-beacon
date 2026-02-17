<script lang="ts">
	import type { TaskType } from '$lib/types.js';
	import { TYPE_LABELS } from '$lib/types.js';

	let { type }: { type: TaskType } = $props();

	let label = $derived(TYPE_LABELS[type]);
</script>

<span class="badge">{label}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.25rem;
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}
</style>
