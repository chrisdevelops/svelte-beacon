<script lang="ts">
	import type { AILogEntry } from '$lib/types.js';
	import { formatRelativeTime, truncate } from '$lib/format.js';
	import LogDetailModal from './LogDetailModal.svelte';

	let {
		taskId,
		active = false,
		onactivity,
	}: {
		taskId: string;
		active: boolean;
		onactivity?: (message: string) => void;
	} = $props();

	let logs = $state<AILogEntry[]>([]);
	let activityMessages = $state<Array<{ id: string; tool?: string; message: string; timestamp: string }>>([]);
	let connected = $state(false);
	let retryCount = $state(0);
	let logContainer: HTMLDivElement | undefined = $state();
	let selectedEntry = $state<AILogEntry | null>(null);

	const MAX_ACTIVITY_ITEMS = 50;
	const RETRY_BASE_MS = 1000;
	const RETRY_MAX_MS = 30_000;
	const MESSAGE_TRUNCATE_LENGTH = 200;

	const LEVEL_CLASSES: Record<string, string> = {
		info: 'level--info',
		progress: 'level--progress',
		blocked: 'level--blocked',
		complete: 'level--complete',
		error: 'level--error',
		warn: 'level--warn',
	};

	function activityToLogEntry(act: { id: string; tool?: string; message: string; timestamp: string }): AILogEntry {
		return {
			id: act.id,
			task_id: taskId,
			level: 'info',
			message: act.message,
			metadata: act.tool ? { tool: act.tool } : null,
			created_at: act.timestamp,
		};
	}

	function handleEntryClick(entry: AILogEntry): void {
		selectedEntry = entry;
	}

	function handleEntryKeydown(e: KeyboardEvent, entry: AILogEntry): void {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			selectedEntry = entry;
		}
	}

	function scrollToBottom(): void {
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	}

	function addLog(entry: AILogEntry): void {
		logs = [...logs, entry];
		requestAnimationFrame(scrollToBottom);
	}

	function addActivity(tool: string | undefined, message: string, timestamp?: string): void {
		const entry = {
			id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			tool,
			message,
			timestamp: timestamp ?? new Date().toISOString(),
		};
		// Ring buffer: keep only the last MAX_ACTIVITY_ITEMS
		if (activityMessages.length >= MAX_ACTIVITY_ITEMS) {
			activityMessages = [...activityMessages.slice(1), entry];
		} else {
			activityMessages = [...activityMessages, entry];
		}
		requestAnimationFrame(scrollToBottom);
	}

	function createLogEntry(
		level: string,
		message: string,
		metadata: Record<string, unknown> | null = null,
		timestamp?: string,
	): AILogEntry {
		return {
			id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			task_id: taskId,
			level,
			message,
			metadata,
			created_at: timestamp ?? new Date().toISOString(),
		};
	}

	function handleEvent(eventType: string, data: string): void {
		try {
			const parsed = JSON.parse(data) as Record<string, unknown>;
			const message = (parsed.message as string) ?? '';
			const metadata = (parsed.metadata as Record<string, unknown>) ?? null;
			const timestamp = (parsed.timestamp as string) ?? undefined;

			switch (eventType) {
				case 'log':
					addLog(createLogEntry(
						(parsed.level as string) ?? 'info',
						message,
						metadata,
						timestamp,
					));
					break;
				case 'progress':
					addLog(createLogEntry('progress', message, metadata, timestamp));
					break;
				case 'blocked':
					addLog(createLogEntry('blocked', (parsed.reason as string) ?? message, metadata, timestamp));
					break;
				case 'complete':
					addLog(createLogEntry('complete', message || 'AI execution completed.', metadata, timestamp));
					break;
				case 'error':
					addLog(createLogEntry('error', message || 'An error occurred.', metadata, timestamp));
					break;
				case 'activity':
					addActivity(
						(parsed.tool as string) ?? undefined,
						message,
						timestamp,
					);
					onactivity?.(message);
					break;
				case 'connected':
					connected = true;
					retryCount = 0;
					break;
				default:
					addLog(createLogEntry('info', message, metadata, timestamp));
			}
		} catch {
			addLog(createLogEntry('info', data));
		}
	}

	async function fetchHistoricalLogs(): Promise<void> {
		try {
			const res = await fetch(`/__beacon/api/ai/logs/${taskId}`, {
				headers: { 'Accept': 'application/json' },
			});
			if (!res.ok) return;
			const data = (await res.json()) as AILogEntry[];
			if (Array.isArray(data) && data.length > 0) {
				logs = data;
				requestAnimationFrame(scrollToBottom);
			}
		} catch {
			// Fetch failure is non-fatal
		}
	}

	$effect(() => {
		if (!active) {
			connected = false;
			// Fetch historical logs when inactive so users can review past runs
			fetchHistoricalLogs();
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

			const eventTypes = ['log', 'progress', 'blocked', 'complete', 'error', 'connected', 'activity'];
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

				// Exponential backoff capped at RETRY_MAX_MS — no retry limit
				localRetryCount++;
				retryCount = localRetryCount;
				const delay = Math.min(RETRY_BASE_MS * Math.pow(2, localRetryCount - 1), RETRY_MAX_MS);
				retryTimeout = setTimeout(connect, delay);
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
				Reconnecting ({retryCount})...
			{:else if active}
				Connecting...
			{:else}
				Disconnected
			{/if}
		</span>
	</div>

	<div class="log-container" bind:this={logContainer}>
		{#if logs.length === 0 && activityMessages.length === 0}
			<div class="log-empty">
				{#if active}
					Waiting for log entries...
				{:else}
					No log entries.
				{/if}
			</div>
		{:else}
			{#each logs as entry (entry.id)}
				<div
					class="log-entry clickable"
					role="button"
					tabindex="0"
					onclick={() => handleEntryClick(entry)}
					onkeydown={(e) => handleEntryKeydown(e, entry)}
				>
					<time class="log-time">{formatRelativeTime(entry.created_at)}</time>
					<span class="log-level {LEVEL_CLASSES[entry.level] ?? 'level--info'}">
						{entry.level}
					</span>
					<span class="log-message">{truncate(entry.message, MESSAGE_TRUNCATE_LENGTH)}</span>
				</div>
			{/each}
			{#if activityMessages.length > 0}
				<div class="activity-divider"></div>
				{#each activityMessages as act (act.id)}
					<div
						class="log-entry activity-entry clickable"
						role="button"
						tabindex="0"
						onclick={() => handleEntryClick(activityToLogEntry(act))}
						onkeydown={(e) => handleEntryKeydown(e, activityToLogEntry(act))}
					>
						<time class="log-time">{formatRelativeTime(act.timestamp)}</time>
						{#if act.tool}
							<span class="activity-tool">{act.tool}</span>
						{/if}
						<span class="log-message activity-message">{truncate(act.message, MESSAGE_TRUNCATE_LENGTH)}</span>
					</div>
				{/each}
			{/if}
		{/if}
	</div>
</div>

{#if selectedEntry}
	<LogDetailModal entry={selectedEntry} onclose={() => { selectedEntry = null; }} />
{/if}

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

	.log-entry.clickable {
		cursor: pointer;
	}

	.log-entry.clickable:focus-visible {
		outline: 2px solid var(--color-accent, #3b82f6);
		outline-offset: -2px;
	}

	.activity-entry {
		opacity: 0.65;
		font-size: 0.75rem;
	}

	.activity-divider {
		height: 1px;
		background: var(--color-border);
		margin: 0.25rem 0;
		opacity: 0.5;
	}

	.activity-tool {
		flex-shrink: 0;
		display: inline-block;
		padding: 0.0625rem 0.375rem;
		border-radius: 3px;
		font-size: 0.625rem;
		font-weight: 500;
		text-transform: uppercase;
		background: color-mix(in srgb, #8b5cf6 12%, transparent);
		color: #8b5cf6;
		min-width: 3rem;
		text-align: center;
	}

	.activity-message {
		color: var(--color-text-secondary);
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
