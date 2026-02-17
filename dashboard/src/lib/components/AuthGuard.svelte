<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';

	let { children } = $props();

	let checked = $state(false);
	let authenticated = $state(false);

	onMount(async () => {
		try {
			const session = await api.getSession();
			authenticated = session.authenticated;
			if (!session.authenticated) {
				window.location.href = '/__beacon/login';
			}
		} catch {
			window.location.href = '/__beacon/login';
		} finally {
			checked = true;
		}
	});
</script>

{#if !checked}
	<div class="auth-loading" aria-live="polite">Checking authentication...</div>
{:else if authenticated}
	{@render children?.()}
{/if}

<style>
	.auth-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		color: var(--color-text-secondary);
	}
</style>
