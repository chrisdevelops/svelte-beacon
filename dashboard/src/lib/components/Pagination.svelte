<script lang="ts">
	import type { Pagination as PaginationType } from '$lib/types.js';

	let {
		pagination,
		onchange,
	}: {
		pagination: PaginationType;
		onchange: (page: number) => void;
	} = $props();

	let pages = $derived(getPageWindow(pagination.page, pagination.totalPages));

	function getPageWindow(current: number, total: number): number[] {
		const windowSize = 5;
		const half = Math.floor(windowSize / 2);
		let start = Math.max(1, current - half);
		const end = Math.min(total, start + windowSize - 1);
		start = Math.max(1, end - windowSize + 1);

		const result: number[] = [];
		for (let i = start; i <= end; i++) {
			result.push(i);
		}
		return result;
	}
</script>

{#if pagination.totalPages > 1}
	<nav class="pagination" aria-label="Pagination">
		<button
			disabled={pagination.page <= 1}
			onclick={() => onchange(pagination.page - 1)}
			aria-label="Previous page"
		>
			Prev
		</button>

		{#each pages as page}
			<button
				class:active={page === pagination.page}
				onclick={() => onchange(page)}
				aria-label="Page {page}"
				aria-current={page === pagination.page ? 'page' : undefined}
			>
				{page}
			</button>
		{/each}

		<button
			disabled={pagination.page >= pagination.totalPages}
			onclick={() => onchange(pagination.page + 1)}
			aria-label="Next page"
		>
			Next
		</button>
	</nav>
{/if}

<style>
	.pagination {
		display: flex;
		gap: 0.25rem;
		align-items: center;
		justify-content: center;
		padding: 1rem 0;
	}

	button {
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.875rem;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.active {
		background: var(--color-accent);
		color: white;
		border-color: var(--color-accent);
	}
</style>
