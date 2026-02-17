<script lang="ts">
	import type { TaskDetail, Attachment } from '$lib/types.js';

	let {
		task,
	}: {
		task: TaskDetail;
	} = $props();

	const screenshots: Attachment[] = $derived(
		task.attachments.filter((a) => a.type === 'screenshot')
	);

	const hasMedia: boolean = $derived(
		screenshots.length > 0 || task.element_selector !== null
	);
</script>

<div class="media-tab">
	{#if !hasMedia}
		<div class="empty-state">
			<p>No media attachments</p>
		</div>
	{:else}
		{#if screenshots.length > 0}
			<section class="media-section">
				<h3>Screenshots</h3>
				<div class="screenshot-grid">
					{#each screenshots as attachment (attachment.id)}
						<img
							class="screenshot-img"
							src={attachment.url}
							alt={attachment.filename}
							loading="lazy"
						/>
					{/each}
				</div>
			</section>
		{/if}

		{#if task.element_selector}
			<section class="media-section">
				<h3>Element Selector</h3>
				<code class="element-code">{task.element_selector}</code>
			</section>
		{/if}
	{/if}
</div>

<style>
	.media-tab {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.media-section h3 {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin-bottom: 0.75rem;
	}

	.screenshot-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
	}

	.screenshot-img {
		max-width: 100%;
		height: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		cursor: pointer;
	}

	.screenshot-img:hover {
		border-color: var(--color-accent);
	}

	.element-code {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		background: var(--color-bg-secondary);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
		border: 1px solid var(--color-border);
		word-break: break-all;
		white-space: pre-wrap;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-secondary);
		padding: 2rem 1rem;
		font-size: 0.875rem;
	}
</style>
