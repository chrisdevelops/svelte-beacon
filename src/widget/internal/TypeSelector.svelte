<script lang="ts">
	import type { TaskType } from './types.js';
	import { TASK_TYPES, TYPE_LABELS } from './types.js';

	interface Props {
		value: TaskType;
		onchange: (type: TaskType) => void;
	}

	let { value, onchange }: Props = $props();
</script>

<div class="beacon-field">
	<span class="beacon-label" id="beacon-type-label">Type</span>
	<div class="beacon-btn-group" role="radiogroup" aria-labelledby="beacon-type-label">
		{#each TASK_TYPES as t (t)}
			<button
				type="button"
				class="beacon-btn-group-item"
				role="radio"
				aria-checked={value === t}
				onclick={() => onchange(t)}
			>
				{TYPE_LABELS[t]}
			</button>
		{/each}
	</div>
</div>
