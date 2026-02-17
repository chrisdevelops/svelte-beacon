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

	// Elapsed time ticker — updates every second when running
	let elapsedSeconds = $state(0);
	let elapsedTimer: ReturnType<typeof setInterval> | null = null;

	function startElapsedTimer(): void {
		stopElapsedTimer();
		elapsedSeconds = 0;
		elapsedTimer = setInterval(() => {
			elapsedSeconds++;
		}, 1000);
	}

	function stopElapsedTimer(): void {
		if (elapsedTimer !== null) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
	}

	function formatElapsed(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m === 0) return `${s}s`;
		return `${m}m ${s.toString().padStart(2, '0')}s`;
	}

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

	// Start/stop elapsed timer based on status
	$effect(() => {
		if (effectiveStatus === 'running') {
			startElapsedTimer();
		} else {
			stopElapsedTimer();
		}

		return () => {
			stopElapsedTimer();
		};
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

	{#if effectiveStatus === 'running'}
		<div class="running-banner">
			<span class="running-indicator"></span>
			<span class="running-text">AI Working</span>
			<span class="elapsed-time">{formatElapsed(elapsedSeconds)}</span>
			<button
				class="stop-button"
				onclick={handleStop}
				disabled={loading}
			>
				Stop
			</button>
		</div>
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

	.running-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: color-mix(in srgb, #3b82f6 8%, transparent);
		border: 1px solid color-mix(in srgb, #3b82f6 20%, transparent);
		border-radius: var(--radius);
	}

	.running-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #3b82f6;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.running-text {
		font-size: 0.875rem;
		font-weight: 500;
		color: #3b82f6;
	}

	.elapsed-time {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		font-family: var(--font-mono);
		margin-left: auto;
	}

	.stop-button {
		padding: 0.25rem 0.75rem;
		background: #ef4444;
		color: white;
		border: none;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
	}

	.stop-button:hover {
		background: #dc2626;
	}

	.stop-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
