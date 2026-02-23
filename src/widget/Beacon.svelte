<script lang="ts">
	import { onMount } from 'svelte';
	import { mount, unmount } from 'svelte';
	import { injectStyles } from './internal/styles.js';
	import { createWidgetState } from './internal/shared-state.svelte.js';
	import { fetchConfig } from './internal/api.js';
	import BeaconWidget from './internal/BeaconWidget.svelte';

	interface Props {
		/** Enable or disable the widget. */
		enabled?: boolean;
		/** Widget position. Overrides server config if set. */
		position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
		/** Enable screenshot capture. Overrides server config if set. */
		screenshot?: boolean;
		/** Enable element selector. Overrides server config if set. */
		elementSelector?: boolean;
		/** Enable AI assist. Overrides server config if set. */
		aiAssist?: boolean;
		/** Require email field. Overrides server config if set. */
		requireEmail?: boolean;
	}

	let { enabled = true, position, screenshot, elementSelector, aiAssist, requireEmail }: Props = $props();

	let hostEl: HTMLDivElement | undefined = $state();
	let innerComponent: Record<string, unknown> | null = null;

	onMount(() => {
		if (!enabled || !hostEl) return;

		const shadowRoot = hostEl.attachShadow({ mode: 'open' });

		// Inject styles into shadow root
		injectStyles(shadowRoot);

		// Create shared state
		const state = createWidgetState({ position, screenshot, elementSelector, aiAssist, requireEmail });

		// Mount BeaconWidget into shadow root
		const target = document.createElement('div');
		shadowRoot.appendChild(target);
		innerComponent = mount(BeaconWidget, { target, props: { ws: state, hostElement: hostEl } });

		// Fetch config (non-blocking — widget renders with defaults immediately)
		fetchConfig()
			.then((config) => state.setConfig(config))
			.catch(() => {
				// Config fetch failed — continue with defaults
			});

		return () => {
			if (innerComponent) {
				unmount(innerComponent);
				innerComponent = null;
			}
		};
	});
</script>

{#if enabled}
	<div bind:this={hostEl} data-beacon-host></div>
{/if}
