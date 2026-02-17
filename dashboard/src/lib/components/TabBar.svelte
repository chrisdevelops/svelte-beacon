<script lang="ts">
	let {
		tabs,
		active,
		onchange,
	}: {
		tabs: { id: string; label: string; count?: number }[];
		active: string;
		onchange: (id: string) => void;
	} = $props();
</script>

<nav class="tab-bar">
	{#each tabs as tab (tab.id)}
		<button
			class="tab-btn"
			class:active={tab.id === active}
			onclick={() => onchange(tab.id)}
		>
			{tab.label}
			{#if tab.count !== undefined}
				<span class="tab-count">{tab.count}</span>
			{/if}
		</button>
	{/each}
</nav>

<style>
	.tab-bar {
		display: flex;
		border-bottom: 1px solid var(--color-border);
		padding: 0 1.5rem;
		gap: 0;
	}

	.tab-btn {
		padding: 0.625rem 1rem;
		border: none;
		border-bottom: 2px solid transparent;
		background: transparent;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.tab-btn:hover {
		color: var(--color-text);
	}

	.tab-btn.active {
		color: var(--color-accent);
		border-bottom-color: var(--color-accent);
		font-weight: 600;
	}

	.tab-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.375rem;
		font-size: 0.6875rem;
		font-weight: 600;
		border-radius: 9999px;
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}

	.tab-btn.active .tab-count {
		background: color-mix(in srgb, var(--color-accent) 12%, transparent);
		color: var(--color-accent);
	}
</style>
