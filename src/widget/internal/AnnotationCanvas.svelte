<script lang="ts">
	import { onMount } from 'svelte';
	import { createAnnotationState } from './annotation-state.svelte.js';
	import type { AnnotationState } from './annotation-state.svelte.js';
	import type { Point } from './annotation-types.js';
	import { renderAll } from './annotation-renderer.js';
	import { flattenAnnotations } from './annotation-export.js';
	import AnnotationToolbar from './AnnotationToolbar.svelte';

	interface Props {
		screenshotBlob: Blob;
		screenshotWidth: number;
		screenshotHeight: number;
		ondone: (annotatedBlob: Blob) => void;
		onskip: () => void;
	}

	let { screenshotBlob, screenshotWidth, screenshotHeight, ondone, onskip }: Props = $props();

	const as: AnnotationState = createAnnotationState();

	let bgCanvas: HTMLCanvasElement | undefined = $state();
	let drawCanvas: HTMLCanvasElement | undefined = $state();
	let textInput: HTMLInputElement | undefined = $state();
	let container: HTMLElement | undefined = $state();

	const aspectRatio = $derived(screenshotWidth / screenshotHeight);

	// Draw the screenshot on the background canvas once
	onMount(() => {
		if (!bgCanvas) return;
		const ctx = bgCanvas.getContext('2d');
		if (!ctx) return;

		const url = URL.createObjectURL(screenshotBlob);
		const img = new Image();
		img.onload = () => {
			bgCanvas!.width = screenshotWidth;
			bgCanvas!.height = screenshotHeight;
			ctx.drawImage(img, 0, 0, screenshotWidth, screenshotHeight);
			URL.revokeObjectURL(url);
		};
		img.src = url;
	});

	// Redraw annotations whenever they change
	$effect(() => {
		if (!drawCanvas) return;
		const ctx = drawCanvas.getContext('2d');
		if (!ctx) return;

		drawCanvas.width = screenshotWidth;
		drawCanvas.height = screenshotHeight;

		ctx.clearRect(0, 0, screenshotWidth, screenshotHeight);
		renderAll(ctx, screenshotWidth, screenshotHeight, as.annotations);

		// Render active annotation preview
		if (as.activeAnnotation) {
			renderAll(ctx, screenshotWidth, screenshotHeight, [as.activeAnnotation]);
		}
	});

	// Focus text input when it appears
	$effect(() => {
		if (textInput && as.textInputPosition) {
			textInput.focus();
		}
	});

	function getNormalizedPoint(e: PointerEvent): Point {
		if (!drawCanvas) return { x: 0, y: 0 };
		const rect = drawCanvas.getBoundingClientRect();
		return {
			x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
			y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
		};
	}

	function handlePointerDown(e: PointerEvent): void {
		if (e.button !== 0) return;
		const point = getNormalizedPoint(e);
		(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);

		switch (as.tool) {
			case 'brush':
				as.startBrush(point);
				break;
			case 'arrow':
				as.startArrow(point);
				break;
			case 'text':
				// Commit any pending text first
				if (as.textInputPosition) {
					as.commitText();
				}
				as.startText(point);
				break;
		}
	}

	function handlePointerMove(e: PointerEvent): void {
		if (!as.activeAnnotation) return;
		const point = getNormalizedPoint(e);

		switch (as.tool) {
			case 'brush':
				as.continueBrush(point);
				break;
			case 'arrow':
				as.updateArrow(point);
				break;
		}
	}

	function handlePointerUp(): void {
		switch (as.tool) {
			case 'brush':
				as.commitBrush();
				break;
			case 'arrow':
				as.commitArrow();
				break;
		}
	}

	function handleTextKeydown(e: KeyboardEvent): void {
		if (e.key === 'Enter') {
			e.preventDefault();
			as.commitText();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			as.cancelText();
		}
	}

	function handleTextBlur(): void {
		as.commitText();
	}

	function handleKeydown(e: KeyboardEvent): void {
		const isCtrlOrCmd = e.ctrlKey || e.metaKey;
		if (isCtrlOrCmd && e.key === 'z' && !e.shiftKey) {
			e.preventDefault();
			as.undo();
		} else if (isCtrlOrCmd && e.key === 'z' && e.shiftKey) {
			e.preventDefault();
			as.redo();
		}
	}

	async function handleDone(): Promise<void> {
		// Commit any pending text
		if (as.textInputPosition) {
			as.commitText();
		}

		if (as.annotations.length === 0) {
			// No annotations — just pass original blob
			ondone(screenshotBlob);
			return;
		}

		try {
			const result = await flattenAnnotations(
				screenshotBlob,
				as.annotations,
				screenshotWidth,
				screenshotHeight,
			);
			ondone(result);
		} catch {
			// Fallback to original if flatten fails
			ondone(screenshotBlob);
		}
	}

	function handleSkip(): void {
		onskip();
	}

	const cursorStyle = $derived(as.tool === 'text' ? 'text' : 'crosshair');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="beacon-annotation-container"
	bind:this={container}
	onkeydown={handleKeydown}
	tabindex="-1"
	role="application"
	aria-label="Screenshot annotation"
>
	<div class="beacon-annotation-canvas-wrapper" style="aspect-ratio: {aspectRatio};">
		<canvas
			class="beacon-annotation-bg-canvas"
			bind:this={bgCanvas}
		></canvas>
		<canvas
			class="beacon-annotation-draw-canvas"
			bind:this={drawCanvas}
			style="cursor: {cursorStyle};"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
		></canvas>

		{#if as.textInputPosition}
			<input
				bind:this={textInput}
				class="beacon-annotation-text-input"
				style="left: {as.textInputPosition.x * 100}%; top: {as.textInputPosition.y * 100}%; color: {as.color};"
				value={as.textInputValue}
				oninput={(e) => as.updateTextInput(e.currentTarget.value)}
				onkeydown={handleTextKeydown}
				onblur={handleTextBlur}
				type="text"
				placeholder="Type here..."
			/>
		{/if}
	</div>

	<AnnotationToolbar
		annotationState={as}
		ondone={handleDone}
		onskip={handleSkip}
	/>
</div>
