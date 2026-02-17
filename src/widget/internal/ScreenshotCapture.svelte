<script lang="ts">
	import type { WidgetState } from './shared-state.svelte.js';
	import { captureScreenshot } from './screenshot.js';
	import AnnotationCanvas from './AnnotationCanvas.svelte';

	type CaptureState = 'idle' | 'capturing' | 'annotating' | 'preview' | 'error';

	interface Props {
		ws: WidgetState;
		hostElement: HTMLElement | null;
	}

	let { ws, hostElement }: Props = $props();

	let captureState: CaptureState = $state('idle');
	let errorMessage: string = $state('');
	let capturedBlob: Blob | null = $state(null);
	let capturedWidth: number = $state(0);
	let capturedHeight: number = $state(0);

	// Derive preview state from the widget state's screenshot
	const hasScreenshot = $derived(ws.screenshot !== null);

	// When the widget state already has a screenshot, show the preview
	const effectiveState: CaptureState = $derived(
		captureState === 'capturing' ? 'capturing' :
		captureState === 'annotating' ? 'annotating' :
		captureState === 'error' ? 'error' :
		hasScreenshot ? 'preview' : 'idle'
	);

	async function handleCapture(): Promise<void> {
		captureState = 'capturing';
		errorMessage = '';

		try {
			const result = await captureScreenshot({ hideElement: hostElement });
			capturedBlob = result.blob;
			capturedWidth = result.width;
			capturedHeight = result.height;
			captureState = 'annotating';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Screenshot capture failed';
			captureState = 'error';
		}
	}

	function handleAnnotationDone(annotatedBlob: Blob): void {
		ws.setScreenshot(annotatedBlob);
		capturedBlob = null;
		captureState = 'preview';
	}

	function handleAnnotationSkip(): void {
		if (capturedBlob) {
			ws.setScreenshot(capturedBlob);
		}
		capturedBlob = null;
		captureState = 'preview';
	}

	function handleRetake(): void {
		ws.clearScreenshot();
		capturedBlob = null;
		captureState = 'idle';
		// Start a new capture immediately
		handleCapture();
	}

	function handleRemove(): void {
		ws.clearScreenshot();
		capturedBlob = null;
		captureState = 'idle';
		errorMessage = '';
	}

	function handleRetry(): void {
		captureState = 'idle';
		errorMessage = '';
		handleCapture();
	}
</script>

<div class="beacon-screenshot">
	{#if effectiveState === 'idle'}
		<button
			class="beacon-screenshot-btn"
			onclick={handleCapture}
			disabled={ws.submitting}
			type="button"
		>
			<svg class="beacon-screenshot-icon" viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
				<path fill="currentColor" d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
			</svg>
			Take screenshot
		</button>
	{:else if effectiveState === 'capturing'}
		<div class="beacon-screenshot-capturing">
			<span class="beacon-screenshot-spinner" aria-hidden="true"></span>
			<span>Capturing...</span>
		</div>
	{:else if effectiveState === 'annotating'}
		{#if capturedBlob}
			<AnnotationCanvas
				screenshotBlob={capturedBlob}
				screenshotWidth={capturedWidth}
				screenshotHeight={capturedHeight}
				ondone={handleAnnotationDone}
				onskip={handleAnnotationSkip}
			/>
		{/if}
	{:else if effectiveState === 'preview'}
		<div class="beacon-screenshot-preview">
			{#if ws.screenshotUrl}
				<img
					class="beacon-screenshot-thumbnail"
					src={ws.screenshotUrl}
					alt="Screenshot preview"
				/>
			{/if}
			<div class="beacon-screenshot-actions">
				<button
					class="beacon-btn-secondary beacon-screenshot-action-btn"
					onclick={handleRetake}
					disabled={ws.submitting}
					type="button"
				>
					Retake
				</button>
				<button
					class="beacon-btn-secondary beacon-screenshot-action-btn"
					onclick={handleRemove}
					disabled={ws.submitting}
					type="button"
				>
					Remove
				</button>
			</div>
		</div>
	{:else if effectiveState === 'error'}
		<div class="beacon-screenshot-error">
			<span class="beacon-screenshot-error-text">{errorMessage}</span>
			<button
				class="beacon-btn-secondary beacon-screenshot-action-btn"
				onclick={handleRetry}
				type="button"
			>
				Retry
			</button>
		</div>
	{/if}
</div>
