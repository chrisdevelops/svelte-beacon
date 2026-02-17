<script lang="ts">
	import type { TaskDetail, AgentState, AgentStatus } from '$lib/types.js';
	import { api } from '$lib/api.js';
	import AIControls from './AIControls.svelte';
	import AILogStream from './AILogStream.svelte';

	let {
		task,
		onupdated,
	}: {
		task: TaskDetail;
		onupdated: (updated: TaskDetail) => void;
	} = $props();

	let loading = $state(false);
	let error = $state('');
	let agentState = $state<AgentState>({
		status: 'idle',
		taskId: null,
		phase: null,
		startedAt: null,
		lastMessage: null,
		blockedQuestion: null,
	});

	// Derive effective agent status from task status and agentState
	const effectiveStatus: AgentStatus = $derived.by(() => {
		// If agentState has a non-idle status for this task, use that
		if (agentState.taskId === task.id && agentState.status !== 'idle') {
			return agentState.status;
		}
		// Otherwise derive from task status
		if (task.status === 'ai_working') return 'running';
		if (task.status === 'blocked') return 'blocked';
		if (task.status === 'done' && task.ai_branch) return 'completed';
		return 'idle';
	});

	const agentBusy = $derived(
		agentState.taskId !== null && agentState.taskId !== task.id
	);

	const streamActive = $derived(
		effectiveStatus === 'running' || effectiveStatus === 'blocked'
	);

	async function handleStart(): Promise<void> {
		loading = true;
		error = '';
		try {
			agentState = await api.startAI(task.id);
			const updated = await api.getTask(task.id);
			onupdated(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to start AI';
		} finally {
			loading = false;
		}
	}

	async function handleStop(): Promise<void> {
		loading = true;
		error = '';
		try {
			agentState = await api.stopAI(task.id);
			const updated = await api.getTask(task.id);
			onupdated(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to stop AI';
		} finally {
			loading = false;
		}
	}

	async function handleUnblock(answer: string): Promise<void> {
		loading = true;
		error = '';
		try {
			agentState = await api.unblockAI(task.id, answer);
			const updated = await api.getTask(task.id);
			onupdated(updated);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to unblock AI';
		} finally {
			loading = false;
		}
	}
</script>

<div class="ai-status">
	{#if error}
		<div class="error-banner" role="alert">{error}</div>
	{/if}

	<section class="ai-section">
		<h3>Controls</h3>
		<AIControls
			{task}
			agentStatus={effectiveStatus}
			agentPhase={agentState.phase}
			{agentBusy}
			blockedQuestion={agentState.blockedQuestion ?? task.ai_blocked_reason}
			{loading}
			onstart={handleStart}
			onstop={handleStop}
			onunblock={handleUnblock}
		/>
	</section>

	<section class="ai-section">
		<AILogStream taskId={task.id} active={streamActive} />
	</section>
</div>

<style>
	.ai-status {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.ai-section h3 {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: 0.75rem;
	}

	.error-banner {
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, #ef4444 10%, transparent);
		color: #ef4444;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}
</style>
