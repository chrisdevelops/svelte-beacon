<script lang="ts">
	import type { AnnotationState } from './annotation-state.svelte.js';
	import type { AnnotationTool } from './annotation-types.js';
	import { COLOR_PALETTE, STROKE_WIDTHS } from './annotation-types.js';

	interface Props {
		annotationState: AnnotationState;
		ondone: () => void;
		onskip: () => void;
	}

	let { annotationState: as, ondone, onskip }: Props = $props();

	const tools: { id: AnnotationTool; label: string; icon: string }[] = [
		{ id: 'brush', label: 'Brush', icon: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
		{ id: 'arrow', label: 'Arrow', icon: 'M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z' },
		{ id: 'text', label: 'Text', icon: 'M5 4v3h5.5v12h3V7H19V4z' },
	];
</script>

<div class="beacon-annotation-toolbar">
	<div class="beacon-annotation-toolbar-row">
		<div class="beacon-annotation-tool-group" role="radiogroup" aria-label="Drawing tool">
			{#each tools as t (t.id)}
				<button
					class="beacon-annotation-tool-btn"
					class:beacon-annotation-tool-btn--active={as.tool === t.id}
					onclick={() => as.setTool(t.id)}
					aria-checked={as.tool === t.id}
					aria-label={t.label}
					title={t.label}
					role="radio"
					type="button"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						<path fill="currentColor" d={t.icon} />
					</svg>
				</button>
			{/each}
		</div>

		<div class="beacon-annotation-separator"></div>

		<div class="beacon-annotation-color-group" role="radiogroup" aria-label="Annotation color">
			{#each COLOR_PALETTE as c (c)}
				<button
					class="beacon-annotation-color-swatch"
					class:beacon-annotation-color-swatch--active={as.color === c}
					style="background-color: {c};"
					onclick={() => as.setColor(c)}
					aria-checked={as.color === c}
					aria-label={c}
					role="radio"
					type="button"
				></button>
			{/each}
		</div>

		<div class="beacon-annotation-separator"></div>

		<div class="beacon-annotation-history-group">
			<button
				class="beacon-annotation-history-btn"
				onclick={() => as.undo()}
				disabled={!as.canUndo}
				aria-label="Undo"
				title="Undo (Ctrl+Z)"
				type="button"
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
				</svg>
			</button>
			<button
				class="beacon-annotation-history-btn"
				onclick={() => as.redo()}
				disabled={!as.canRedo}
				aria-label="Redo"
				title="Redo (Ctrl+Shift+Z)"
				type="button"
			>
				<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
					<path fill="currentColor" d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z" />
				</svg>
			</button>
		</div>
	</div>

	<div class="beacon-annotation-toolbar-actions">
		<button
			class="beacon-btn-secondary beacon-annotation-action-btn"
			onclick={onskip}
			type="button"
		>
			Skip
		</button>
		<button
			class="beacon-btn-primary beacon-annotation-action-btn"
			onclick={ondone}
			type="button"
		>
			Done
		</button>
	</div>
</div>
