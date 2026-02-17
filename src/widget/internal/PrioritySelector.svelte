<script lang="ts">
	import type { Priority } from './types.js';
	import { PRIORITY_LEVELS, PRIORITY_LABELS } from './types.js';

	interface Props {
		value: Priority;
		onchange: (priority: Priority) => void;
	}

	let { value, onchange }: Props = $props();
</script>

<div class="beacon-field">
	<span class="beacon-label" id="beacon-priority-label">Priority</span>
	<div class="beacon-btn-group" role="radiogroup" aria-labelledby="beacon-priority-label">
		{#each PRIORITY_LEVELS as p (p)}
			<button
				type="button"
				class="beacon-btn-group-item"
				role="radio"
				aria-checked={value === p}
				onclick={() => onchange(p)}
			>
				{PRIORITY_LABELS[p]}
			</button>
		{/each}
	</div>
</div>
