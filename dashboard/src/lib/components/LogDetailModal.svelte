<script lang="ts">
	import type { AILogEntry } from '$lib/types.js';
	import { formatDate, formatRelativeTime } from '$lib/format.js';

	let {
		entry,
		onclose,
	}: {
		entry: AILogEntry;
		onclose: () => void;
	} = $props();

	let dialogEl: HTMLDialogElement | undefined = $state();
	let copied = $state(false);

	const LEVEL_CLASSES: Record<string, string> = {
		info: 'level--info',
		progress: 'level--progress',
		blocked: 'level--blocked',
		complete: 'level--complete',
		error: 'level--error',
		warn: 'level--warn',
	};

	const toolName = $derived(
		entry.metadata && typeof entry.metadata.tool === 'string' ? entry.metadata.tool : null
	);

	$effect(() => {
		if (dialogEl) {
			dialogEl.showModal();
		}
	});

	function handleBackdropClick(e: MouseEvent): void {
		if (e.target === dialogEl) {
			onclose();
		}
	}

	async function handleCopy(): Promise<void> {
		const parts = [
			`Level: ${entry.level}`,
			`Time: ${formatDate(entry.created_at)} (${formatRelativeTime(entry.created_at)})`,
		];
		if (toolName) {
			parts.push(`Tool: ${toolName}`);
		}
		parts.push('', entry.message);

		await navigator.clipboard.writeText(parts.join('\n'));
		copied = true;
		setTimeout(() => { copied = false; }, 2000);
	}
</script>

<dialog
	bind:this={dialogEl}
	class="log-modal"
	onclick={handleBackdropClick}
	onclose={onclose}
>
	<div class="modal-content">
		<header class="modal-header">
			<h3>Log Detail</h3>
			<button class="close-button" onclick={onclose} aria-label="Close">&times;</button>
		</header>

		<div class="modal-body">
			<div class="detail-row">
				<span class="detail-label">Level</span>
				<span class="log-level {LEVEL_CLASSES[entry.level] ?? 'level--info'}">{entry.level}</span>
			</div>
			<div class="detail-row">
				<span class="detail-label">Time</span>
				<span class="detail-value">{formatDate(entry.created_at)} ({formatRelativeTime(entry.created_at)})</span>
			</div>
			{#if toolName}
				<div class="detail-row">
					<span class="detail-label">Tool</span>
					<span class="tool-badge">{toolName}</span>
				</div>
			{/if}

			<div class="message-section">
				<div class="message-header">
					<span class="detail-label">Message</span>
					<button class="copy-button" onclick={handleCopy}>
						{copied ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<pre class="message-content">{entry.message}</pre>
			</div>
		</div>
	</div>
</dialog>

<style>
	.log-modal {
		border: none;
		border-radius: var(--radius, 8px);
		padding: 0;
		max-width: 640px;
		width: 90vw;
		background: var(--color-bg, #fff);
		color: var(--color-text, #1a1a1a);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
	}

	.log-modal::backdrop {
		background: rgba(0, 0, 0, 0.4);
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0;
	}

	.modal-header h3 {
		font-size: 1rem;
		font-weight: 600;
		margin: 0;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--color-text-secondary, #6b7280);
		cursor: pointer;
		padding: 0.25rem;
	}

	.close-button:hover {
		color: var(--color-text, #1a1a1a);
	}

	.modal-body {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 1.25rem 1.25rem;
	}

	.detail-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.detail-label {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary, #6b7280);
		min-width: 3.5rem;
	}

	.detail-value {
		font-size: 0.875rem;
	}

	.log-level {
		display: inline-block;
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
	}

	.level--info {
		background: color-mix(in srgb, #6b7280 12%, transparent);
		color: #6b7280;
	}

	.level--progress {
		background: color-mix(in srgb, #3b82f6 12%, transparent);
		color: #3b82f6;
	}

	.level--blocked {
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		color: #f59e0b;
	}

	.level--complete {
		background: color-mix(in srgb, #22c55e 12%, transparent);
		color: #22c55e;
	}

	.level--error {
		background: color-mix(in srgb, #ef4444 12%, transparent);
		color: #ef4444;
	}

	.level--warn {
		background: color-mix(in srgb, #eab308 12%, transparent);
		color: #eab308;
	}

	.tool-badge {
		display: inline-block;
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		background: color-mix(in srgb, #8b5cf6 12%, transparent);
		color: #8b5cf6;
	}

	.message-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}

	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.copy-button {
		padding: 0.25rem 0.625rem;
		background: var(--color-bg-secondary, #f3f4f6);
		border: 1px solid var(--color-border, #e5e7eb);
		border-radius: var(--radius, 6px);
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--color-text-secondary, #6b7280);
		cursor: pointer;
	}

	.copy-button:hover {
		background: var(--color-border, #e5e7eb);
	}

	.message-content {
		margin: 0;
		padding: 0.75rem;
		background: var(--color-bg-secondary, #f8f9fa);
		border: 1px solid var(--color-border, #e5e7eb);
		border-radius: var(--radius, 6px);
		font-family: var(--font-mono, monospace);
		font-size: 0.8125rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 400px;
		overflow-y: auto;
	}
</style>
