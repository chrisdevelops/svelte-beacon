<script lang="ts">
	interface Props {
		error: string;
		fields?: Record<string, string>;
		onretry: () => void;
		ondismiss: () => void;
	}

	let { error, fields, onretry, ondismiss }: Props = $props();

	const fieldEntries = $derived(fields ? Object.entries(fields) : []);
</script>

<div class="beacon-message beacon-message--error">
	<div class="beacon-message-icon">
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
		</svg>
	</div>
	<h3 class="beacon-message-title">Something went wrong</h3>
	<p class="beacon-message-text">{error}</p>

	{#if fieldEntries.length > 0}
		<ul class="beacon-field-errors">
			{#each fieldEntries as [field, message] (field)}
				<li>{field}: {message}</li>
			{/each}
		</ul>
	{/if}

	<div class="beacon-message-actions">
		<button class="beacon-btn-secondary" onclick={ondismiss}>Dismiss</button>
		<button class="beacon-btn-primary" onclick={onretry}>Try again</button>
	</div>
</div>
