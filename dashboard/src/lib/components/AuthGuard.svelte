<script lang="ts">
	import { api } from '$lib/api.js';
	import { setAuthContext } from '$lib/auth-context.js';

	let { children } = $props();

	let checked = $state(false);
	let authenticated = $state(false);
	let isAdmin = $state(false);

	setAuthContext({
		get isAdmin() {
			return isAdmin;
		},
	});

	async function checkAuth(): Promise<void> {
		try {
			const session = await api.getSession();
			authenticated = session.authenticated;
			isAdmin = session.isAdmin ?? false;
			if (!session.authenticated) {
				window.location.href = '/__beacon/login';
			}
		} catch {
			window.location.href = '/__beacon/login';
		} finally {
			checked = true;
		}
	}

	$effect(() => {
		checkAuth();
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
