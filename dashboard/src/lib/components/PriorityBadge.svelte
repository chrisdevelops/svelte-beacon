<script lang="ts">
	import type { Priority } from '$lib/types.js';
	import { PRIORITY_LABELS } from '$lib/types.js';
	import { PRIORITY_COLORS } from '$lib/status.js';

	let { priority }: { priority: Priority } = $props();

	let label = $derived(PRIORITY_LABELS[priority]);
	let color = $derived(PRIORITY_COLORS[priority]);
</script>

<span class="badge" style:--badge-color={color}>{label}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.25rem;
		background: color-mix(in srgb, var(--badge-color) 15%, transparent);
		color: var(--badge-color);
	}
</style>
