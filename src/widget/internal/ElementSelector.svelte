<script lang="ts">
	import type { WidgetState } from './shared-state.svelte.js';
	import { startSelection } from './element-selector.js';

	interface Props {
		ws: WidgetState;
		hostElement: HTMLElement | null;
	}

	let { ws, hostElement }: Props = $props();

	const hasElement = $derived(!!ws.selectedElement);

	function handleSelect(): void {
		ws.startElementSelection();
	}

	function handleChange(): void {
		ws.finishElementSelection('');
		ws.startElementSelection();
	}

	function handleClear(): void {
		ws.finishElementSelection('');
	}

	// Manage the selection lifecycle via $effect.
	// When ws.selectingElement becomes true, start selection mode.
	// The effect cleanup function tears down the overlay and listeners.
	$effect(() => {
		if (!ws.selectingElement) return;

		const cleanup = startSelection({
			ignoreElement: hostElement,
			onSelect(selector: string) {
				ws.finishElementSelection(selector);
			},
			onCancel() {
				ws.cancelElementSelection();
			},
		});

		return cleanup;
	});
</script>

<div class="beacon-element-selector">
	{#if hasElement}
		<div class="beacon-element-badge" title={ws.selectedElement ?? ''}>
			<svg class="beacon-element-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M3 3h8v2H5v6H3V3zm18 0v8h-2V5h-6V3h8zM3 13v8h8v-2H5v-6H3zm18 0v6h-6v2h8v-8h-2z" />
			</svg>
			<span class="beacon-element-badge-text">{ws.selectedElement}</span>
		</div>
		<div class="beacon-element-actions">
			<button
				class="beacon-btn-secondary beacon-element-action-btn"
				onclick={handleChange}
				disabled={ws.submitting}
				type="button"
			>
				Change
			</button>
			<button
				class="beacon-btn-secondary beacon-element-action-btn"
				onclick={handleClear}
				disabled={ws.submitting}
				type="button"
			>
				Clear
			</button>
		</div>
	{:else}
		<button
			class="beacon-element-btn"
			onclick={handleSelect}
			disabled={ws.submitting}
			type="button"
		>
			<svg class="beacon-element-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M3 3h8v2H5v6H3V3zm18 0v8h-2V5h-6V3h8zM3 13v8h8v-2H5v-6H3zm18 0v6h-6v2h8v-8h-2z" />
			</svg>
			Select element
		</button>
	{/if}
</div>
