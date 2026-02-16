<script lang="ts">
	import { onMount } from 'svelte';
	import { mount, unmount } from 'svelte';

	interface Props {
		/** Enable or disable the widget. */
		enabled?: boolean;
		/** Widget position. Overrides server config if set. */
		position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
	}

	let { enabled = true, position }: Props = $props();

	let hostEl: HTMLDivElement | undefined = $state();
	let mounted = $state(false);
	let shadowRoot: ShadowRoot | null = $state(null);
	let innerComponent: Record<string, unknown> | null = null;

	onMount(() => {
		if (!enabled || !hostEl) return;

		mounted = true;
		shadowRoot = hostEl.attachShadow({ mode: 'open' });

		// TODO: Inject styles via adoptedStyleSheets
		// TODO: Mount BeaconWidget into shadow root
		// TODO: Fetch config from /__beacon/api/config

		return () => {
			// Cleanup
			if (innerComponent) {
				unmount(innerComponent);
				innerComponent = null;
			}
			if (shadowRoot) {
				shadowRoot.adoptedStyleSheets = [];
			}
		};
	});
</script>

{#if enabled}
	<div bind:this={hostEl} data-beacon-host style="display: contents;"></div>
{/if}
