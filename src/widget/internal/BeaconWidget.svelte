<script lang="ts">
	import type { WidgetState } from './shared-state.svelte.js';
	import FloatingButton from './FloatingButton.svelte';
	import FeedbackPanel from './FeedbackPanel.svelte';

	interface Props {
		ws: WidgetState;
		hostElement: HTMLElement | null;
	}

	let { ws, hostElement }: Props = $props();

	function handleFabClick(): void {
		if (ws.selectingElement) {
			ws.cancelElementSelection();
		} else if (ws.isOpen) {
			ws.close();
		} else {
			ws.open();
		}
	}
</script>

<div class="beacon-root" data-position={ws.position}>
	<FeedbackPanel {ws} {hostElement} />
	<FloatingButton open={ws.isOpen} onclick={handleFabClick} />
</div>
