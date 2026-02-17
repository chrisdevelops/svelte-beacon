<script lang="ts">
	import type { WidgetState } from './shared-state.svelte.js';
	import { requestAIAssist } from './api.js';
	import { collectMetadata } from './metadata.js';

	interface Props {
		ws: WidgetState;
	}

	let { ws }: Props = $props();

	const canRequest = $derived(
		ws.description.trim().length >= 10 &&
		!ws.submitting &&
		ws.aiAssistState !== 'loading'
	);

	const hasChanges = $derived(
		ws.aiSuggestion !== null && (
			ws.aiSuggestion.suggested_type !== ws.type ||
			ws.aiSuggestion.suggested_priority !== ws.priority
		)
	);

	async function handleRequest(): Promise<void> {
		if (!canRequest) return;

		ws.setAILoading();

		const metadata = collectMetadata();
		const result = await requestAIAssist({
			description: ws.description.trim(),
			type: ws.type,
			priority: ws.priority,
			route: metadata.url ?? undefined,
			element_selector: ws.selectedElement ?? undefined,
		});

		if (result.ok) {
			ws.setAISuggestion(result.data);
		} else {
			ws.setAIError(result.error);
		}
	}
</script>

<div class="beacon-ai-assist">
	{#if ws.aiAssistState === 'idle'}
		<button
			class="beacon-ai-assist-btn"
			disabled={!canRequest}
			onclick={handleRequest}
		>
			<svg class="beacon-ai-assist-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61z" />
			</svg>
			Improve with AI
		</button>
	{:else if ws.aiAssistState === 'loading'}
		<div class="beacon-ai-assist-loading">
			<span class="beacon-ai-assist-spinner"></span>
			Improving description...
		</div>
	{:else if ws.aiAssistState === 'ready' && ws.aiSuggestion}
		<div class="beacon-ai-assist-suggestion">
			<p class="beacon-ai-assist-reasoning">{ws.aiSuggestion.reasoning}</p>
			<div class="beacon-ai-assist-preview">
				<p class="beacon-ai-assist-preview-text">{ws.aiSuggestion.improved_description}</p>
			</div>
			{#if hasChanges}
				<div class="beacon-ai-assist-changes">
					{#if ws.aiSuggestion.suggested_type !== ws.type}
						<span class="beacon-ai-assist-change">
							Type: {ws.type} → {ws.aiSuggestion.suggested_type}
						</span>
					{/if}
					{#if ws.aiSuggestion.suggested_priority !== ws.priority}
						<span class="beacon-ai-assist-change">
							Priority: {ws.priority} → {ws.aiSuggestion.suggested_priority}
						</span>
					{/if}
				</div>
			{/if}
			<div class="beacon-ai-assist-actions">
				<button
					class="beacon-btn-secondary beacon-ai-assist-action-btn"
					onclick={() => ws.clearAISuggestion()}
				>
					Dismiss
				</button>
				<button
					class="beacon-btn-primary beacon-ai-assist-action-btn"
					onclick={() => ws.acceptAISuggestion()}
				>
					Accept
				</button>
			</div>
		</div>
	{:else if ws.aiAssistState === 'error'}
		<div class="beacon-ai-assist-error">
			<p class="beacon-ai-assist-error-text">{ws.aiError}</p>
			<button
				class="beacon-ai-assist-btn"
				onclick={handleRequest}
				disabled={!canRequest}
			>
				Retry
			</button>
		</div>
	{/if}
</div>
