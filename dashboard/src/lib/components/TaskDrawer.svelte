<script lang="ts">
	import type { TaskDetail, TaskStatus } from '$lib/types.js';
	import { api } from '$lib/api.js';
	import { getAuthContext } from '$lib/auth-context.js';
	import TaskOverview from './TaskOverview.svelte';
	import TabBar from './TabBar.svelte';
	import MediaTab from './MediaTab.svelte';
	import TaskAIStatus from './TaskAIStatus.svelte';
	import NotesTab from './NotesTab.svelte';
	import ActivityTab from './ActivityTab.svelte';

	const auth = getAuthContext();

	let {
		task,
		onclose,
		onupdated,
	}: {
		task: TaskDetail;
		onclose: () => void;
		onupdated: (updated: TaskDetail) => void;
	} = $props();

	let updating = $state(false);
	let error = $state('');
	let activeTab = $state('overview');

	const tabs = $derived([
		{ id: 'overview', label: 'Overview' },
		{ id: 'notes', label: 'Notes', count: task.admin_notes.length || undefined },
		{ id: 'activity', label: 'Activity', count: task.activity.length || undefined },
		{ id: 'media', label: 'Media', count: task.attachments.length || undefined },
		...(auth.isAdmin ? [{ id: 'ai', label: 'AI Status' }] : []),
	]);

	async function handleStatusChange(status: TaskStatus): Promise<void> {
		updating = true;
		error = '';
		try {
			const updated = await api.updateTask(task.id, { status });
			onupdated(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Update failed';
		} finally {
			updating = false;
		}
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') onclose();
	}

	function handleBackdropClick(): void {
		onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="backdrop" onclick={handleBackdropClick}></div>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<aside class="drawer" role="dialog" aria-label="Task #{task.public_id}">
	<header class="drawer-header">
		<h2>Task #{task.public_id}</h2>
		<button class="close-btn" onclick={onclose} aria-label="Close drawer">
			&#x2715;
		</button>
	</header>

	{#if error}
		<div class="error" role="alert">{error}</div>
	{/if}

	<TabBar {tabs} active={activeTab} onchange={(id) => { activeTab = id; }} />

	<div class="drawer-body">
		{#if activeTab === 'overview'}
			<TaskOverview {task} {updating} onstatuschange={handleStatusChange} />
		{:else if activeTab === 'notes'}
			<NotesTab {task} {onupdated} />
		{:else if activeTab === 'activity'}
			<ActivityTab {task} />
		{:else if activeTab === 'media'}
			<MediaTab {task} />
		{:else if activeTab === 'ai' && auth.isAdmin}
			<TaskAIStatus {task} {onupdated} />
		{/if}
	</div>
</aside>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 40;
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(500px, 100vw);
		background: var(--color-bg);
		border-left: 1px solid var(--color-border);
		z-index: 50;
		display: flex;
		flex-direction: column;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.drawer-header h2 {
		font-size: 1.125rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
	}

	.close-btn:hover {
		color: var(--color-text);
	}

	.error {
		margin: 0.75rem 1.5rem 0;
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.drawer-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}
</style>
