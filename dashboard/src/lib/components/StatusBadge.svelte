<script lang="ts">
	import type { TaskStatus } from '$lib/types.js';
	import { STATUS_LABELS, STATUS_COLORS } from '$lib/status.js';

	let { status }: { status: TaskStatus } = $props();

	let label = $derived(STATUS_LABELS[status]);
	let color = $derived(STATUS_COLORS[status]);
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
