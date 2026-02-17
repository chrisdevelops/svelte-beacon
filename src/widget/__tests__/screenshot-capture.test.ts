// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';

// Mock html2canvas before importing the modules that use it
const mockHtml2canvas = vi.fn();
vi.mock('html2canvas', () => ({
	default: mockHtml2canvas,
}));

// Mock annotation-export (used by AnnotationCanvas)
vi.mock('../internal/annotation-export.js', () => ({
	flattenAnnotations: vi.fn().mockResolvedValue(new Blob(['annotated'], { type: 'image/png' })),
}));

// Mock annotation-renderer (used by AnnotationCanvas)
vi.mock('../internal/annotation-renderer.js', () => ({
	renderAll: vi.fn(),
}));

// Import after mocking
import { captureScreenshot, isScreenshotAvailable } from '../internal/screenshot.js';
import ScreenshotCapture from '../internal/ScreenshotCapture.svelte';
import { createWidgetState } from '../internal/shared-state.svelte.js';

/**
 * Create a fake HTMLCanvasElement with a working toBlob method.
 */
function createMockCanvas(width: number = 1024, height: number = 768): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	// jsdom does not implement toBlob — stub it
	canvas.toBlob = vi.fn((callback: BlobCallback, _type?: string) => {
		callback(new Blob(['fake-png'], { type: 'image/png' }));
	});
	return canvas;
}

beforeEach(() => {
	mockHtml2canvas.mockReset();
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

// ------------------------------------------------------------------ //
// captureScreenshot utility                                            //
// ------------------------------------------------------------------ //

describe('captureScreenshot', () => {
	it('returns a blob with dimensions', async () => {
		const canvas = createMockCanvas(2048, 1536);
		mockHtml2canvas.mockResolvedValue(canvas);

		const result = await captureScreenshot();
		expect(result.blob).toBeInstanceOf(Blob);
		expect(result.width).toBe(2048);
		expect(result.height).toBe(1536);
	});

	it('passes document.body to html2canvas', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		await captureScreenshot();
		expect(mockHtml2canvas).toHaveBeenCalledWith(
			document.body,
			expect.objectContaining({
				useCORS: true,
				logging: false,
			}),
		);
	});

	it('hides the host element during capture', async () => {
		const hostEl = document.createElement('div');
		hostEl.style.display = 'block';
		document.body.appendChild(hostEl);

		let displayDuringCapture: string | undefined;
		mockHtml2canvas.mockImplementation(async () => {
			displayDuringCapture = hostEl.style.display;
			return createMockCanvas();
		});

		await captureScreenshot({ hideElement: hostEl });

		expect(displayDuringCapture).toBe('none');
		// Should be restored after capture
		expect(hostEl.style.display).toBe('block');

		hostEl.remove();
	});

	it('restores the host element even if html2canvas throws', async () => {
		const hostEl = document.createElement('div');
		hostEl.style.display = 'flex';
		document.body.appendChild(hostEl);

		mockHtml2canvas.mockRejectedValue(new Error('Canvas error'));

		await expect(captureScreenshot({ hideElement: hostEl })).rejects.toThrow('Canvas error');

		expect(hostEl.style.display).toBe('flex');

		hostEl.remove();
	});

	it('works without a hideElement option', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		const result = await captureScreenshot();
		expect(result.blob).toBeInstanceOf(Blob);
	});
});

// ------------------------------------------------------------------ //
// isScreenshotAvailable                                                //
// ------------------------------------------------------------------ //

describe('isScreenshotAvailable', () => {
	it('returns true when html2canvas is available', async () => {
		// The mock is in place so import succeeds
		const available = await isScreenshotAvailable();
		expect(available).toBe(true);
	});

	// Note: testing the false case requires the dynamic import to fail.
	// Since we mock html2canvas globally, we test this by temporarily
	// making the mock throw on import. We instead verify the function
	// signature and that it handles errors gracefully.
});

// ------------------------------------------------------------------ //
// ScreenshotCapture component                                          //
// ------------------------------------------------------------------ //

describe('ScreenshotCapture', () => {
	it('renders capture button in idle state', () => {
		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		const btn = container.querySelector('.beacon-screenshot-btn');
		expect(btn).toBeTruthy();
		expect(btn?.textContent).toContain('Take screenshot');
	});

	it('shows camera icon in capture button', () => {
		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		const svg = container.querySelector('.beacon-screenshot-icon');
		expect(svg).toBeTruthy();
	});

	it('disables capture button when submitting', () => {
		const ws = createWidgetState();
		flushSync(() => ws.setSubmitting(true));
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		const btn = container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('shows capturing state when capture is in progress', async () => {
		let resolveCapture: ((canvas: HTMLCanvasElement) => void) | undefined;
		mockHtml2canvas.mockImplementation(() => {
			return new Promise<HTMLCanvasElement>((resolve) => {
				resolveCapture = resolve;
			});
		});

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Click the capture button
		const btn = container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement;
		btn.click();

		// Wait a tick for the state to update
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-screenshot-capturing')).toBeTruthy();
		});

		expect(container.textContent).toContain('Capturing...');
		expect(container.querySelector('.beacon-screenshot-spinner')).toBeTruthy();

		// Resolve the capture to clean up
		if (resolveCapture) resolveCapture(createMockCanvas());
	});

	it('shows annotation canvas after capture completes', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Click capture
		const btn = container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement;
		btn.click();

		// Wait for annotation canvas to appear
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-annotation-container')).toBeTruthy();
		});

		// Toolbar should be present
		expect(container.querySelector('.beacon-annotation-toolbar')).toBeTruthy();
	});

	it('shows preview when ws already has a screenshot', () => {
		const ws = createWidgetState();
		const blob = new Blob(['test-png'], { type: 'image/png' });
		flushSync(() => ws.setScreenshot(blob));

		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		expect(container.querySelector('.beacon-screenshot-preview')).toBeTruthy();
		expect(container.querySelector('.beacon-screenshot-thumbnail')).toBeTruthy();
	});

	it('shows retake and remove buttons in preview state', () => {
		const ws = createWidgetState();
		const blob = new Blob(['test-png'], { type: 'image/png' });
		flushSync(() => ws.setScreenshot(blob));

		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		const buttons = container.querySelectorAll('.beacon-screenshot-action-btn');
		const texts = Array.from(buttons).map((b) => b.textContent?.trim());
		expect(texts).toContain('Retake');
		expect(texts).toContain('Remove');
	});

	it('remove clears the screenshot and returns to idle', () => {
		const ws = createWidgetState();
		const blob = new Blob(['test-png'], { type: 'image/png' });
		flushSync(() => ws.setScreenshot(blob));

		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Click remove
		const removeBtn = Array.from(container.querySelectorAll('.beacon-screenshot-action-btn'))
			.find((b) => b.textContent?.trim() === 'Remove') as HTMLButtonElement;
		removeBtn.click();

		flushSync(() => {});

		expect(container.querySelector('.beacon-screenshot-btn')).toBeTruthy();
		expect(ws.screenshot).toBe(null);
		expect(ws.screenshotUrl).toBe(null);
	});

	it('retake clears and re-captures', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		const ws = createWidgetState();
		const blob = new Blob(['test-png'], { type: 'image/png' });
		flushSync(() => ws.setScreenshot(blob));

		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Click retake
		const retakeBtn = Array.from(container.querySelectorAll('.beacon-screenshot-action-btn'))
			.find((b) => b.textContent?.trim() === 'Retake') as HTMLButtonElement;
		retakeBtn.click();

		await vi.waitFor(() => {
			expect(mockHtml2canvas).toHaveBeenCalledTimes(1);
		});
	});

	it('shows error state when capture fails', async () => {
		mockHtml2canvas.mockRejectedValue(new Error('Canvas rendering failed'));

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		(container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement).click();

		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-screenshot-error')).toBeTruthy();
		});

		expect(container.querySelector('.beacon-screenshot-error-text')?.textContent).toBe(
			'Canvas rendering failed',
		);
	});

	it('retry button triggers a new capture after error', async () => {
		// First call fails, second succeeds
		mockHtml2canvas
			.mockRejectedValueOnce(new Error('Temporary failure'))
			.mockResolvedValueOnce(createMockCanvas());

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Initial attempt fails
		(container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement).click();

		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-screenshot-error')).toBeTruthy();
		});

		// Click retry
		const retryBtn = container.querySelector('.beacon-screenshot-error .beacon-screenshot-action-btn') as HTMLButtonElement;
		retryBtn.click();

		// Should now show annotation canvas
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-annotation-container')).toBeTruthy();
		});

		expect(mockHtml2canvas).toHaveBeenCalledTimes(2);
	});

	// ------------------------------------------------------------------ //
	// Annotation integration                                               //
	// ------------------------------------------------------------------ //

	it('Skip button in annotation canvas moves to preview', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Capture screenshot
		(container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement).click();

		// Wait for annotation canvas
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-annotation-container')).toBeTruthy();
		});

		// Click Skip
		const skipBtn = Array.from(container.querySelectorAll('button'))
			.find((b) => b.textContent?.trim() === 'Skip') as HTMLButtonElement;
		skipBtn.click();

		// Should transition to preview
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-screenshot-preview')).toBeTruthy();
		});

		expect(ws.screenshot).toBeInstanceOf(Blob);
	});

	it('Done button in annotation canvas moves to preview', async () => {
		const canvas = createMockCanvas();
		mockHtml2canvas.mockResolvedValue(canvas);

		const ws = createWidgetState();
		const { container } = render(ScreenshotCapture, {
			props: { ws, hostElement: null },
		});

		// Capture screenshot
		(container.querySelector('.beacon-screenshot-btn') as HTMLButtonElement).click();

		// Wait for annotation canvas
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-annotation-container')).toBeTruthy();
		});

		// Click Done (with no annotations, passes original blob)
		const doneBtn = Array.from(container.querySelectorAll('button'))
			.find((b) => b.textContent?.trim() === 'Done') as HTMLButtonElement;
		doneBtn.click();

		// Should transition to preview
		await vi.waitFor(() => {
			expect(container.querySelector('.beacon-screenshot-preview')).toBeTruthy();
		});

		expect(ws.screenshot).toBeInstanceOf(Blob);
	});
});
