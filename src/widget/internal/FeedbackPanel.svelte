<script lang="ts">
	import type { WidgetState } from './shared-state.svelte.js';
	import { collectMetadata } from './metadata.js';
	import { submitFeedbackWithAttachments } from './api.js';
	import TypeSelector from './TypeSelector.svelte';
	import PrioritySelector from './PrioritySelector.svelte';
	import ScreenshotCapture from './ScreenshotCapture.svelte';
	import ElementSelector from './ElementSelector.svelte';
	import AIAssist from './AIAssist.svelte';
	import SuccessMessage from './SuccessMessage.svelte';
	import ErrorMessage from './ErrorMessage.svelte';

	interface Props {
		ws: WidgetState;
		hostElement: HTMLElement | null;
	}

	let { ws, hostElement }: Props = $props();

	let textareaEl: HTMLTextAreaElement | undefined = $state();
	let panelEl: HTMLDivElement | undefined = $state();

	const canSubmit = $derived(
		ws.description.trim().length > 0 && !ws.submitting,
	);

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			ws.close();
		}
	}

	async function handleSubmit(): Promise<void> {
		if (!canSubmit) return;

		ws.setSubmitting(true);

		const metadata = collectMetadata();
		const result = await submitFeedbackWithAttachments(
			{
				type: ws.type,
				priority: ws.priority,
				description: ws.description.trim(),
				route: metadata.url,
				element_selector: ws.selectedElement || null,
				metadata: JSON.stringify(metadata),
				email: ws.email.trim() || null,
			},
			ws.screenshot,
		);

		ws.setResult(result);
	}

	function handleRetry(): void {
		ws.setResult({ ok: false, error: '' });
		ws.open();
	}

	$effect(() => {
		if (ws.view === 'form' && textareaEl) {
			requestAnimationFrame(() => textareaEl?.focus());
		}
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	bind:this={panelEl}
	class="beacon-panel"
	class:beacon-panel--open={ws.isOpen && !ws.selectingElement}
	role="dialog"
	aria-label="Send feedback"
	tabindex="-1"
	onkeydown={handleKeydown}
>
	{#if ws.view === 'success' && ws.lastResult?.ok}
		<div class="beacon-panel-body">
			<SuccessMessage
				publicId={ws.lastResult.data.public_id}
				onclose={() => ws.reset()}
			/>
		</div>
	{:else if ws.view === 'error' && ws.lastResult && !ws.lastResult.ok}
		<div class="beacon-panel-body">
			<ErrorMessage
				error={ws.lastResult.error}
				fields={ws.lastResult.fields}
				onretry={handleRetry}
				ondismiss={() => ws.reset()}
			/>
		</div>
	{:else}
		<div class="beacon-panel-header">
			<h2 class="beacon-panel-title">Send feedback</h2>
			<button
				class="beacon-panel-close"
				aria-label="Close"
				onclick={() => ws.close()}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
				</svg>
			</button>
		</div>
		<div class="beacon-panel-body">
			<TypeSelector
				value={ws.type}
				onchange={(t) => { ws.type = t; }}
			/>

			<PrioritySelector
				value={ws.priority}
				onchange={(p) => { ws.priority = p; }}
			/>

			<div class="beacon-field">
				<label class="beacon-label" for="beacon-description">Description</label>
				<textarea
					bind:this={textareaEl}
					id="beacon-description"
					class="beacon-textarea"
					placeholder="What's on your mind?"
					bind:value={ws.description}
					disabled={ws.submitting}
				></textarea>
			</div>

			{#if ws.config.aiAssist}
				<AIAssist {ws} />
			{/if}

			{#if ws.config.screenshot}
				<ScreenshotCapture {ws} {hostElement} />
			{/if}

			{#if ws.config.elementSelector}
				<ElementSelector {ws} {hostElement} />
			{/if}

			{#if ws.config.requireEmail}
				<div class="beacon-field">
					<label class="beacon-label" for="beacon-email">Email</label>
					<input
						id="beacon-email"
						class="beacon-input"
						type="email"
						placeholder="you@example.com"
						bind:value={ws.email}
						disabled={ws.submitting}
					/>
				</div>
			{/if}

			<button
				class="beacon-submit"
				disabled={!canSubmit}
				onclick={handleSubmit}
			>
				{#if ws.submitting}
					Submitting...
				{:else}
					Submit feedback
				{/if}
			</button>
		</div>
	{/if}
</div>
