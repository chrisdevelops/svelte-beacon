<script lang="ts">
	import type { TaskDetail, TaskStatus } from '$lib/types.js';
	import { TYPE_LABELS, PRIORITY_LABELS } from '$lib/types.js';
	import StatusDropdown from './StatusDropdown.svelte';
	import { formatDate } from '$lib/format.js';

	let {
		task,
		updating = false,
		onstatuschange,
	}: {
		task: TaskDetail;
		updating?: boolean;
		onstatuschange: (status: TaskStatus) => void;
	} = $props();
</script>

<div class="overview">
	<section class="section">
		<h3>Status</h3>
		<StatusDropdown
			current={task.status}
			onchange={onstatuschange}
			disabled={updating}
		/>
	</section>

	<section class="section">
		<h3>Description</h3>
		<p class="description">{task.description}</p>
	</section>

	<section class="section">
		<h3>Details</h3>
		<dl class="meta-grid">
			<dt>Type</dt>
			<dd>{TYPE_LABELS[task.type]}</dd>

			<dt>Priority</dt>
			<dd>{PRIORITY_LABELS[task.priority]}</dd>

			{#if task.route}
				<dt>Route</dt>
				<dd class="mono">{task.route}</dd>
			{/if}

			{#if task.user_email}
				<dt>Email</dt>
				<dd>{task.user_email}</dd>
			{/if}

			<dt>Created</dt>
			<dd>{formatDate(task.created_at)}</dd>

			<dt>Updated</dt>
			<dd>{formatDate(task.updated_at)}</dd>
		</dl>
	</section>

</div>

<style>
	.overview {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.section h3 {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: 0.5rem;
	}

	.description {
		white-space: pre-wrap;
		line-height: 1.6;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.375rem 1rem;
		font-size: 0.875rem;
	}

	.meta-grid dt {
		color: var(--color-text-secondary);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

</style>
