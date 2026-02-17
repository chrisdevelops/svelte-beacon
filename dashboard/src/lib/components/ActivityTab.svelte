<script lang="ts">
	import type { TaskDetail, TaskStatus } from '$lib/types.js';
	import { STATUS_LABELS } from '$lib/status.js';
	import { formatRelativeTime } from '$lib/format.js';

	let {
		task,
	}: {
		task: TaskDetail;
	} = $props();
</script>

<div class="activity-tab">
	{#if task.activity.length === 0}
		<p class="empty">No activity recorded yet</p>
	{:else}
		<ul class="activity-list">
			{#each task.activity as entry (entry.id)}
				<li class="activity-item">
					<span class="activity-actor">{entry.actor}</span>
					<span class="activity-action">
						{#if entry.action === 'status_change'}
							changed status from
							<strong>{STATUS_LABELS[entry.old_value as TaskStatus] ?? entry.old_value}</strong>
							to
							<strong>{STATUS_LABELS[entry.new_value as TaskStatus] ?? entry.new_value}</strong>
						{:else}
							{entry.action}
						{/if}
					</span>
					<time class="activity-time">{formatRelativeTime(entry.created_at)}</time>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.activity-tab {
		display: flex;
		flex-direction: column;
	}

	.empty {
		text-align: center;
		color: var(--color-text-secondary);
		padding: 1.5rem 0;
		font-size: 0.875rem;
	}

	.activity-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.activity-item {
		font-size: 0.875rem;
		line-height: 1.4;
		padding-left: 0.75rem;
		border-left: 2px solid var(--color-border);
	}

	.activity-actor {
		font-weight: 500;
	}

	.activity-time {
		display: block;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
</style>
