<script lang="ts">
	import type { TaskDetail, AgentStatus, AgentPhase } from '$lib/types.js';
	import { STATUS_LABELS } from '$lib/status.js';

	let {
		task,
		agentStatus = 'idle',
		agentPhase = null,
		agentBusy = false,
		blockedQuestion = null,
		loading = false,
		onstart,
		onstop,
		onunblock,
	}: {
		task: TaskDetail;
		agentStatus: AgentStatus;
		agentPhase: AgentPhase | null;
		agentBusy: boolean;
		blockedQuestion: string | null;
		loading: boolean;
		onstart: () => void;
		onstop: () => void;
		onunblock: (answer: string) => void;
	} = $props();

	let answer = $state('');

	const PHASE_LABELS: Record<AgentPhase, string> = {
		starting: 'Starting',
		analyzing: 'Analyzing',
		planning: 'Planning',
		implementing: 'Implementing',
		testing: 'Testing',
		verifying: 'Verifying',
		committing: 'Committing',
	};

	const canStart = $derived(
		agentStatus === 'idle' && task.status === 'backlog' && !agentBusy && !loading
	);

	function handleUnblock(): void {
		if (answer.trim()) {
			onunblock(answer.trim());
			answer = '';
		}
	}
</script>

<div class="ai-controls">
	{#if agentStatus === 'idle'}
		<div class="controls-section">
			{#if task.status === 'backlog'}
				<button
					class="btn btn-start"
					onclick={onstart}
					disabled={!canStart}
					aria-label="Start AI"
				>
					{#if loading}
						Starting...
					{:else if agentBusy}
						Agent busy
					{:else}
						Start AI
					{/if}
				</button>
				<p class="hint">Start the AI agent to work on this task.</p>
			{:else if task.status === 'done' || task.status === 'closed'}
				<div class="status-message">
					<span class="status-icon status-icon--done">&#10003;</span>
					<span>Task is {STATUS_LABELS[task.status].toLowerCase()}.</span>
				</div>
			{:else if task.status === 'needs_review'}
				<div class="status-message">
					<span class="status-icon status-icon--review">&#9998;</span>
					<span>Task is awaiting review. Move to backlog to re-run AI.</span>
				</div>
			{:else}
				<div class="status-message">
					<span class="status-icon">&#8505;</span>
					<span>Move task to backlog to enable AI processing.</span>
				</div>
			{/if}
		</div>

	{:else if agentStatus === 'running'}
		<div class="controls-section">
			<div class="running-indicator">
				<span class="spinner" aria-hidden="true"></span>
				<span class="running-label">AI Working</span>
				{#if agentPhase}
					<span class="phase-badge">{PHASE_LABELS[agentPhase]}</span>
				{/if}
			</div>
			<button
				class="btn btn-stop"
				onclick={onstop}
				disabled={loading}
				aria-label="Stop AI"
			>
				{loading ? 'Stopping...' : 'Stop AI'}
			</button>
		</div>

	{:else if agentStatus === 'blocked'}
		<div class="controls-section">
			<div class="blocked-indicator">
				<span class="blocked-icon" aria-hidden="true">&#9888;</span>
				<span class="blocked-label">AI Blocked</span>
			</div>
			{#if blockedQuestion}
				<div class="blocked-question">
					<p class="question-label">Question from AI:</p>
					<p class="question-text">{blockedQuestion}</p>
				</div>
			{/if}
			<div class="unblock-form">
				<textarea
					class="answer-input"
					bind:value={answer}
					placeholder="Type your answer..."
					rows="3"
					aria-label="Answer for AI"
				></textarea>
				<button
					class="btn btn-resume"
					onclick={handleUnblock}
					disabled={loading || !answer.trim()}
					aria-label="Resume AI"
				>
					{loading ? 'Resuming...' : 'Resume'}
				</button>
			</div>
		</div>

	{:else if agentStatus === 'completed'}
		<div class="controls-section">
			<div class="completed-indicator">
				<span class="status-icon status-icon--done">&#10003;</span>
				<span>AI completed successfully.</span>
			</div>
			{#if task.ai_branch}
				<div class="result-detail">
					<span class="result-label">Branch:</span>
					<code class="result-value">{task.ai_branch}</code>
				</div>
			{/if}
			{#if task.ai_pr_url}
				<div class="result-detail">
					<span class="result-label">PR:</span>
					<a class="result-link" href={task.ai_pr_url} target="_blank" rel="noopener">
						{task.ai_pr_url}
					</a>
				</div>
			{/if}
		</div>

	{:else if agentStatus === 'failed'}
		<div class="controls-section">
			<div class="failed-indicator">
				<span class="status-icon status-icon--failed">&#10007;</span>
				<span>AI execution failed.</span>
			</div>
			<button
				class="btn btn-start"
				onclick={onstart}
				disabled={loading || agentBusy}
				aria-label="Retry AI"
			>
				{loading ? 'Starting...' : 'Retry'}
			</button>
		</div>

	{:else if agentStatus === 'stopping'}
		<div class="controls-section">
			<div class="running-indicator">
				<span class="spinner" aria-hidden="true"></span>
				<span class="running-label">Stopping...</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.ai-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.controls-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.btn {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-start {
		background: #22c55e;
		color: white;
		align-self: flex-start;
	}

	.btn-start:hover:not(:disabled) {
		background: #16a34a;
	}

	.btn-stop {
		background: #ef4444;
		color: white;
		align-self: flex-start;
	}

	.btn-stop:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn-resume {
		background: var(--color-accent, #3b82f6);
		color: white;
		align-self: flex-start;
	}

	.btn-resume:hover:not(:disabled) {
		opacity: 0.9;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
	}

	.status-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.status-icon {
		font-size: 1rem;
	}

	.status-icon--done {
		color: #22c55e;
	}

	.status-icon--review {
		color: #3b82f6;
	}

	.status-icon--failed {
		color: #ef4444;
	}

	.running-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.running-label {
		font-weight: 500;
		color: #f59e0b;
	}

	.phase-badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		color: #f59e0b;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.spinner {
		display: inline-block;
		width: 1rem;
		height: 1rem;
		border: 2px solid #f59e0b;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.blocked-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.blocked-icon {
		font-size: 1.125rem;
		color: #f59e0b;
	}

	.blocked-label {
		font-weight: 500;
		color: #f59e0b;
	}

	.blocked-question {
		background: color-mix(in srgb, #f59e0b 8%, transparent);
		border: 1px solid color-mix(in srgb, #f59e0b 20%, transparent);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
	}

	.question-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		margin-bottom: 0.375rem;
	}

	.question-text {
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.unblock-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.answer-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.875rem;
		font-family: inherit;
		resize: vertical;
	}

	.answer-input:focus {
		outline: none;
		border-color: var(--color-accent, #3b82f6);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent, #3b82f6) 20%, transparent);
	}

	.completed-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.failed-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #ef4444;
	}

	.result-detail {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.result-label {
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	.result-value {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		background: var(--color-bg-secondary);
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
	}

	.result-link {
		color: var(--color-accent, #3b82f6);
		text-decoration: none;
	}

	.result-link:hover {
		text-decoration: underline;
	}
</style>
