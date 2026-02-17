<script lang="ts">
	import type { TaskDetail, TaskStatus } from '$lib/types.js';
	import { TYPE_LABELS, PRIORITY_LABELS } from '$lib/types.js';
	import StatusDropdown from './StatusDropdown.svelte';
	import { formatDate } from '$lib/format.js';
	import { formatMetadata } from '$lib/metadata.js';

	let {
		task,
		updating = false,
		onstatuschange,
	}: {
		task: TaskDetail;
		updating?: boolean;
		onstatuschange: (status: TaskStatus) => void;
	} = $props();

	let formatted = $derived(task.metadata ? formatMetadata(task.metadata) : null);
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

	{#if formatted}
		<section class="section">
			<h3>Context</h3>
			<dl class="meta-grid">
				{#if formatted.url}
					<dt>URL</dt>
					<dd class="mono url-value">{formatted.url}</dd>
				{/if}

				{#if formatted.browser}
					<dt>Browser</dt>
					<dd>{formatted.browser}</dd>
				{/if}

				{#if formatted.os}
					<dt>OS</dt>
					<dd>{formatted.os}</dd>
				{/if}

				{#if formatted.viewport}
					<dt>Viewport</dt>
					<dd>{formatted.viewport}</dd>
				{/if}

				{#if formatted.screen}
					<dt>Screen</dt>
					<dd>{formatted.screen}</dd>
				{/if}

				{#if formatted.language}
					<dt>Language</dt>
					<dd>{formatted.language}</dd>
				{/if}

				{#if formatted.darkMode !== null}
					<dt>Dark Mode</dt>
					<dd>{formatted.darkMode ? 'Yes' : 'No'}</dd>
				{/if}

				{#if formatted.accessibility}
					<dt>Accessibility</dt>
					<dd>{formatted.accessibility.join(', ')}</dd>
				{/if}
			</dl>
		</section>
	{/if}

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

	.url-value {
		word-break: break-all;
	}

</style>
