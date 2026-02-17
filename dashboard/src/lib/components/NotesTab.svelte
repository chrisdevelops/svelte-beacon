<script lang="ts">
	import type { TaskDetail, AdminNote } from '$lib/types.js';
	import { api } from '$lib/api.js';
	import { formatRelativeTime } from '$lib/format.js';

	let {
		task,
		onupdated,
	}: {
		task: TaskDetail;
		onupdated: (updated: TaskDetail) => void;
	} = $props();

	let content = $state('');
	let submitting = $state(false);
	let error = $state('');

	async function handleSubmit(): Promise<void> {
		if (!content.trim() || submitting) return;
		submitting = true;
		error = '';
		try {
			await api.addNote(task.id, content.trim());
			const updated = await api.getTask(task.id);
			content = '';
			onupdated(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to add note';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="notes-tab">
	{#if error}
		<div class="error" role="alert">{error}</div>
	{/if}

	<form class="note-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
		<textarea
			bind:value={content}
			placeholder="Add a note..."
			rows="3"
			disabled={submitting}
		></textarea>
		<button type="submit" disabled={submitting || !content.trim()}>
			{submitting ? 'Adding...' : 'Add Note'}
		</button>
	</form>

	{#if task.admin_notes.length === 0}
		<p class="empty">No notes yet</p>
	{:else}
		<ul class="notes-list">
			{#each task.admin_notes as note (note.id)}
				<li class="note-item">
					<div class="note-header">
						<span class="note-author">{note.author_email ?? 'Anonymous'}</span>
						<time class="note-time">{formatRelativeTime(note.created_at)}</time>
					</div>
					<p class="note-content">{note.content}</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.notes-tab {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.error {
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.note-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	textarea {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-family: inherit;
		font-size: 0.875rem;
		resize: vertical;
		box-sizing: border-box;
	}

	textarea:focus {
		outline: 2px solid var(--color-accent);
		outline-offset: -1px;
	}

	button[type="submit"] {
		align-self: flex-end;
		padding: 0.375rem 0.75rem;
		background: var(--color-accent);
		color: white;
		border: none;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
	}

	button[type="submit"]:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty {
		text-align: center;
		color: var(--color-text-secondary);
		padding: 1.5rem 0;
		font-size: 0.875rem;
	}

	.notes-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.note-item {
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
	}

	.note-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.375rem;
	}

	.note-author {
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.note-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.note-content {
		font-size: 0.875rem;
		line-height: 1.5;
		white-space: pre-wrap;
	}
</style>
