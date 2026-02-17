<script lang="ts">
	import type { AILogEntry } from '$lib/types.js';
	import { formatRelativeTime } from '$lib/format.js';

	let {
		taskId,
		active = false,
	}: {
		taskId: string;
		active: boolean;
	} = $props();

	let logs = $state<AILogEntry[]>([]);
	let connected = $state(false);
	let retryCount = $state(0);
	let logContainer: HTMLDivElement | undefined = $state();

	const MAX_RETRIES = 5;
	const RETRY_DELAY_MS = 3000;

	const LEVEL_CLASSES: Record<string, string> = {
		info: 'level--info',
		progress: 'level--progress',
		blocked: 'level--blocked',
		complete: 'level--complete',
		error: 'level--error',
		warn: 'level--warn',
	};

	function scrollToBottom(): void {
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	function addLog(entry: AILogEntry): void {
		logs = [...logs, entry];
		// Use requestAnimationFrame to scroll after DOM update
		requestAnimationFrame(scrollToBottom);
	}

	function createLogEntry(level: string, message: string, metadata: Record<string, unknown> | null = null): AILogEntry {
		return {
			id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			task_id: taskId,
			level,
			message,
			metadata,
			created_at: new Date().toISOString(),
		};
	}

	function handleEvent(eventType: string, data: string): void {
		try {
			const parsed = JSON.parse(data) as Record<string, unknown>;
			const message = (parsed.message as string) ?? '';
			const metadata = (parsed.metadata as Record<string, unknown>) ?? null;

			switch (eventType) {
				case 'log':
					addLog(createLogEntry(
						(parsed.level as string) ?? 'info',
						message,
						metadata,
					));
					break;
				case 'progress':
					addLog(createLogEntry('progress', message, metadata));
					break;
				case 'blocked':
					addLog(createLogEntry('blocked', (parsed.reason as string) ?? message, metadata));
					break;
				case 'complete':
					addLog(createLogEntry('complete', message || 'AI execution completed.', metadata));
					break;
				case 'error':
					addLog(createLogEntry('error', message || 'An error occurred.', metadata));
					break;
				case 'connected':
					connected = true;
					retryCount = 0;
					break;
				default:
					addLog(createLogEntry('info', message, metadata));
			}
		} catch {
			addLog(createLogEntry('info', data));
		}
	}

	$effect(() => {
		if (!active) {
			connected = false;
			return;
		}

		const url = `/__beacon/api/ai/logs/${taskId}`;
		let source: EventSource | null = null;
		let retryTimeout: ReturnType<typeof setTimeout> | null = null;
		let localRetryCount = 0;

		function connect(): void {
			source = new EventSource(url);

			source.onopen = () => {
				connected = true;
				localRetryCount = 0;
				retryCount = 0;
			};

			const eventTypes = ['log', 'progress', 'blocked', 'complete', 'error', 'connected'];
			for (const type of eventTypes) {
				source.addEventListener(type, (e: MessageEvent) => {
					handleEvent(type, e.data as string);
				});
			}

			source.onerror = () => {
				connected = false;
				if (source) {
					source.close();
					source = null;
				}

				if (localRetryCount < MAX_RETRIES) {
					localRetryCount++;
					retryCount = localRetryCount;
					retryTimeout = setTimeout(connect, RETRY_DELAY_MS);
				}
			};
		}

		connect();

		return () => {
			if (source) {
				source.close();
				source = null;
			}
			if (retryTimeout) {
				clearTimeout(retryTimeout);
				retryTimeout = null;
			}
			connected = false;
		};
	});
</script>

<div class="log-stream">
	<div class="log-header">
		<h3>Logs</h3>
		<span class="connection-status" class:connected>
			{#if connected}
				Connected
			{:else if retryCount > 0}
				Reconnecting ({retryCount}/{MAX_RETRIES})...
			{:else if active}
				Connecting...
			{:else}
				Disconnected
			{/if}
		</span>
	</div>

	<div class="log-container" bind:this={logContainer}>
		{#if logs.length === 0}
			<div class="log-empty">
				{#if active}
					Waiting for log entries...
				{:else}
					No log entries.
				{/if}
			</div>
		{:else}
			{#each logs as entry (entry.id)}
				<div class="log-entry">
					<time class="log-time">{formatRelativeTime(entry.created_at)}</time>
					<span class="log-level {LEVEL_CLASSES[entry.level] ?? 'level--info'}">
						{entry.level}
					</span>
					<span class="log-message">{entry.message}</span>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.log-stream {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.log-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.log-header h3 {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
	}

	.connection-status {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.connection-status.connected {
		color: #22c55e;
	}

	.log-container {
		max-height: 320px;
		overflow-y: auto;
		background: var(--color-bg-secondary, #f8f9fa);
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		padding: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	.log-empty {
		padding: 1rem;
		text-align: center;
		color: var(--color-text-secondary);
		font-family: inherit;
		font-size: 0.8125rem;
	}

	.log-entry {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.25rem 0.375rem;
		line-height: 1.4;
		border-radius: 2px;
	}

	.log-entry:hover {
		background: color-mix(in srgb, var(--color-text) 4%, transparent);
	}

	.log-time {
		flex-shrink: 0;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		min-width: 4rem;
	}

	.log-level {
		flex-shrink: 0;
		display: inline-block;
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		min-width: 4rem;
		text-align: center;
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

	.log-message {
		word-break: break-word;
		color: var(--color-text);
	}
</style>
