// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';

// Mock canvas getContext since jsdom doesn't implement it
const mockCtx = {
	clearRect: vi.fn(),
	drawImage: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	stroke: vi.fn(),
	fill: vi.fn(),
	closePath: vi.fn(),
	fillText: vi.fn(),
	strokeStyle: '',
	fillStyle: '',
	lineWidth: 0,
	lineCap: 'butt',
	lineJoin: 'miter',
	font: '',
	textBaseline: 'alphabetic',
	shadowColor: '',
	shadowBlur: 0,
	shadowOffsetX: 0,
	shadowOffsetY: 0,
};

// Mock flattenAnnotations
vi.mock('../internal/annotation-export.js', () => ({
	flattenAnnotations: vi.fn().mockResolvedValue(new Blob(['annotated'], { type: 'image/png' })),
}));

// Mock renderAll (pure function, tested separately)
vi.mock('../internal/annotation-renderer.js', () => ({
	renderAll: vi.fn(),
}));

import AnnotationCanvas from '../internal/AnnotationCanvas.svelte';
import { flattenAnnotations } from '../internal/annotation-export.js';

const mockFlattenAnnotations = vi.mocked(flattenAnnotations);

beforeEach(() => {
	vi.resetAllMocks();
	mockFlattenAnnotations.mockResolvedValue(new Blob(['annotated'], { type: 'image/png' }));

	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));

	// Mock canvas getContext
	const origCreateElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
		const el = origCreateElement(tagName);
		if (tagName === 'canvas') {
			vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(mockCtx as never);
		}
		return el;
	});

	// Mock URL.createObjectURL / revokeObjectURL
	vi.stubGlobal('URL', {
		...URL,
		createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
		revokeObjectURL: vi.fn(),
	});

	// Mock Image
	vi.stubGlobal('Image', class MockImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		private _src = '';
		get src() { return this._src; }
		set src(val: string) {
			this._src = val;
			setTimeout(() => this.onload?.(), 0);
		}
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderCanvas(overrides: Partial<{
	ondone: (blob: Blob) => void;
	onskip: () => void;
}> = {}) {
	return render(AnnotationCanvas, {
		props: {
			screenshotBlob: new Blob(['screenshot'], { type: 'image/png' }),
			screenshotWidth: 1024,
			screenshotHeight: 768,
			ondone: overrides.ondone ?? vi.fn(),
			onskip: overrides.onskip ?? vi.fn(),
		},
	});
}

describe('AnnotationCanvas', () => {
	// ------------------------------------------------------------------ //
	// Toolbar rendering                                                    //
	// ------------------------------------------------------------------ //

	it('renders the annotation container', () => {
		const { container } = renderCanvas();
		expect(container.querySelector('.beacon-annotation-container')).toBeTruthy();
	});

	it('renders the canvas wrapper', () => {
		const { container } = renderCanvas();
		expect(container.querySelector('.beacon-annotation-canvas-wrapper')).toBeTruthy();
	});

	it('renders the toolbar', () => {
		const { container } = renderCanvas();
		expect(container.querySelector('.beacon-annotation-toolbar')).toBeTruthy();
	});

	it('renders three tool buttons', () => {
		const { container } = renderCanvas();
		const toolBtns = container.querySelectorAll('.beacon-annotation-tool-btn');
		expect(toolBtns).toHaveLength(3);
	});

	it('brush tool is active by default', () => {
		const { container } = renderCanvas();
		const brushBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Brush"]');
		expect(brushBtn?.getAttribute('aria-checked')).toBe('true');
		expect(brushBtn?.classList.contains('beacon-annotation-tool-btn--active')).toBe(true);
	});

	// ------------------------------------------------------------------ //
	// Tool switching                                                       //
	// ------------------------------------------------------------------ //

	it('switches to arrow tool on click', async () => {
		const { container } = renderCanvas();
		const arrowBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Arrow"]') as HTMLButtonElement;
		arrowBtn.click();
		await vi.waitFor(() => {
			expect(arrowBtn.getAttribute('aria-checked')).toBe('true');
			expect(arrowBtn.classList.contains('beacon-annotation-tool-btn--active')).toBe(true);
		});
	});

	it('switches to text tool on click', async () => {
		const { container } = renderCanvas();
		const textBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Text"]') as HTMLButtonElement;
		textBtn.click();
		await vi.waitFor(() => {
			expect(textBtn.getAttribute('aria-checked')).toBe('true');
		});
	});

	// ------------------------------------------------------------------ //
	// Color selection                                                      //
	// ------------------------------------------------------------------ //

	it('renders color swatches', () => {
		const { container } = renderCanvas();
		const swatches = container.querySelectorAll('.beacon-annotation-color-swatch');
		expect(swatches.length).toBe(8);
	});

	it('first color (red) is active by default', () => {
		const { container } = renderCanvas();
		const activeSwatches = container.querySelectorAll('.beacon-annotation-color-swatch--active');
		expect(activeSwatches).toHaveLength(1);
	});

	it('changes active color on swatch click', async () => {
		const { container } = renderCanvas();
		const swatches = container.querySelectorAll('.beacon-annotation-color-swatch');
		const blueBtn = swatches[4] as HTMLButtonElement; // blue at index 4
		blueBtn.click();
		await vi.waitFor(() => {
			expect(blueBtn.classList.contains('beacon-annotation-color-swatch--active')).toBe(true);
		});
	});

	// ------------------------------------------------------------------ //
	// Undo/redo buttons                                                    //
	// ------------------------------------------------------------------ //

	it('undo button is disabled initially', () => {
		const { container } = renderCanvas();
		const undoBtn = container.querySelector('[aria-label="Undo"]') as HTMLButtonElement;
		expect(undoBtn.disabled).toBe(true);
	});

	it('redo button is disabled initially', () => {
		const { container } = renderCanvas();
		const redoBtn = container.querySelector('[aria-label="Redo"]') as HTMLButtonElement;
		expect(redoBtn.disabled).toBe(true);
	});

	// ------------------------------------------------------------------ //
	// Skip / Done callbacks                                                //
	// ------------------------------------------------------------------ //

	it('calls onskip when Skip button is clicked', () => {
		const onskip = vi.fn();
		const { container } = renderCanvas({ onskip });
		const skipBtn = Array.from(container.querySelectorAll('button'))
			.find((b) => b.textContent?.trim() === 'Skip') as HTMLButtonElement;
		skipBtn.click();
		expect(onskip).toHaveBeenCalledTimes(1);
	});

	it('calls ondone when Done button is clicked with no annotations', async () => {
		const ondone = vi.fn();
		const { container } = renderCanvas({ ondone });
		const doneBtn = Array.from(container.querySelectorAll('button'))
			.find((b) => b.textContent?.trim() === 'Done') as HTMLButtonElement;
		doneBtn.click();

		await vi.waitFor(() => {
			// With no annotations, it passes the original blob
			expect(ondone).toHaveBeenCalledTimes(1);
			expect(ondone.mock.calls[0][0]).toBeInstanceOf(Blob);
		});
	});

	// ------------------------------------------------------------------ //
	// Draw canvas cursor                                                   //
	// ------------------------------------------------------------------ //

	it('has crosshair cursor for brush tool', () => {
		const { container } = renderCanvas();
		const drawCanvas = container.querySelector('.beacon-annotation-draw-canvas') as HTMLCanvasElement;
		expect(drawCanvas.style.cursor).toBe('crosshair');
	});

	it('has text cursor for text tool', async () => {
		const { container } = renderCanvas();
		const textBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Text"]') as HTMLButtonElement;
		textBtn.click();

		await vi.waitFor(() => {
			const drawCanvas = container.querySelector('.beacon-annotation-draw-canvas') as HTMLCanvasElement;
			expect(drawCanvas.style.cursor).toBe('text');
		});
	});

	// ------------------------------------------------------------------ //
	// Pointer capture behavior                                             //
	// ------------------------------------------------------------------ //

	it('does NOT call setPointerCapture for the text tool', async () => {
		const { container } = renderCanvas();

		// Switch to text tool
		const textBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Text"]') as HTMLButtonElement;
		textBtn.click();
		await vi.waitFor(() => {
			expect(textBtn.getAttribute('aria-checked')).toBe('true');
		});

		const drawCanvas = container.querySelector('.beacon-annotation-draw-canvas') as HTMLCanvasElement;
		// jsdom does not define setPointerCapture — add it before spying
		drawCanvas.setPointerCapture = () => {};
		const setPointerCaptureSpy = vi.spyOn(drawCanvas, 'setPointerCapture');

		// Simulate pointerdown on the draw canvas
		const pointerEvent = new PointerEvent('pointerdown', {
			button: 0,
			pointerId: 1,
			clientX: 100,
			clientY: 100,
			bubbles: true,
		});
		drawCanvas.dispatchEvent(pointerEvent);

		expect(setPointerCaptureSpy).not.toHaveBeenCalled();
	});

	it('shows text input when clicking canvas with text tool selected', async () => {
		const { container } = renderCanvas();

		// Switch to text tool
		const textBtn = container.querySelector('.beacon-annotation-tool-btn[aria-label="Text"]') as HTMLButtonElement;
		textBtn.click();
		await vi.waitFor(() => {
			expect(textBtn.getAttribute('aria-checked')).toBe('true');
		});

		const drawCanvas = container.querySelector('.beacon-annotation-draw-canvas') as HTMLCanvasElement;
		drawCanvas.setPointerCapture = () => {};

		// Mock getBoundingClientRect for coordinate normalization
		vi.spyOn(drawCanvas, 'getBoundingClientRect').mockReturnValue({
			left: 0, top: 0, right: 1024, bottom: 768, width: 1024, height: 768,
			x: 0, y: 0, toJSON: () => {},
		});

		// Simulate pointerdown on the draw canvas
		const pointerEvent = new PointerEvent('pointerdown', {
			button: 0,
			pointerId: 1,
			clientX: 200,
			clientY: 150,
			bubbles: true,
		});
		drawCanvas.dispatchEvent(pointerEvent);

		// Text input should appear
		await vi.waitFor(() => {
			const textInput = container.querySelector('.beacon-annotation-text-input') as HTMLInputElement;
			expect(textInput).toBeTruthy();
		});
	});

	it('calls setPointerCapture for the brush tool', async () => {
		const { container } = renderCanvas();

		// Brush is the default tool, no need to switch
		const drawCanvas = container.querySelector('.beacon-annotation-draw-canvas') as HTMLCanvasElement;
		// jsdom does not define setPointerCapture — add it before spying
		drawCanvas.setPointerCapture = () => {};
		const setPointerCaptureSpy = vi.spyOn(drawCanvas, 'setPointerCapture');

		// Simulate pointerdown on the draw canvas
		const pointerEvent = new PointerEvent('pointerdown', {
			button: 0,
			pointerId: 42,
			clientX: 100,
			clientY: 100,
			bubbles: true,
		});
		drawCanvas.dispatchEvent(pointerEvent);

		expect(setPointerCaptureSpy).toHaveBeenCalledWith(42);
	});
});
