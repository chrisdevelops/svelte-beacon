<script lang="ts">
	let {
		value = '',
		onchange,
	}: {
		value?: string;
		onchange: (value: string) => void;
	} = $props();

	let timer: ReturnType<typeof setTimeout> | undefined;

	function handleInput(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		clearTimeout(timer);
		timer = setTimeout(() => {
			onchange(input.value);
		}, 300);
	}
</script>

<input
	type="search"
	placeholder="Search tasks..."
	{value}
	oninput={handleInput}
	aria-label="Search tasks"
/>

<style>
	input {
		padding: 0.375rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.875rem;
		min-width: 200px;
	}

	input::placeholder {
		color: var(--color-text-secondary);
	}
</style>
