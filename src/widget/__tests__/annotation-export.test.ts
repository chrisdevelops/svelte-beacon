// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Annotation, BrushAnnotation, ArrowAnnotation } from '../internal/annotation-types.js';

// Mock dependencies
vi.mock('../internal/annotation-renderer.js', () => ({
	renderAll: vi.fn(),
}));

vi.mock('../internal/screenshot.js', () => ({
	canvasToBlob: vi.fn(),
}));

// Import after mocking
import { flattenAnnotations } from '../internal/annotation-export.js';
import { renderAll } from '../internal/annotation-renderer.js';
import { canvasToBlob } from '../internal/screenshot.js';

const mockRenderAll = vi.mocked(renderAll);
const mockCanvasToBlob = vi.mocked(canvasToBlob);

// Mock canvas getContext
const mockCtx = {
	drawImage: vi.fn(),
} as unknown as CanvasRenderingContext2D;

beforeEach(() => {
	vi.resetAllMocks();

	// Mock document.createElement for canvas
	const origCreateElement = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
		const el = origCreateElement(tagName);
		if (tagName === 'canvas') {
			vi.spyOn(el as HTMLCanvasElement, 'getContext').mockReturnValue(mockCtx as never);
		}
		return el;
	});

	// Mock Image to trigger onload immediately
	vi.stubGlobal('Image', class MockImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		private _src = '';
		get src() { return this._src; }
		set src(val: string) {
			this._src = val;
			// Trigger onload asynchronously
			Promise.resolve().then(() => this.onload?.());
		}
	});

	// Mock URL.createObjectURL and revokeObjectURL
	vi.stubGlobal('URL', {
		...URL,
		createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
		revokeObjectURL: vi.fn(),
	});

	// canvasToBlob returns a new blob
	mockCanvasToBlob.mockResolvedValue(new Blob(['annotated-png'], { type: 'image/png' }));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('flattenAnnotations', () => {
	const screenshotBlob = new Blob(['screenshot-data'], { type: 'image/png' });

	it('returns a PNG blob', async () => {
		const result = await flattenAnnotations(screenshotBlob, [], 1024, 768);
		expect(result).toBeInstanceOf(Blob);
		expect(result.type).toBe('image/png');
	});

	it('calls drawImage with the loaded screenshot', async () => {
		await flattenAnnotations(screenshotBlob, [], 1024, 768);
		expect(mockCtx.drawImage).toHaveBeenCalledWith(
			expect.any(Object), // the Image instance
			0, 0, 1024, 768,
		);
	});

	it('calls renderAll with annotations', async () => {
		const annotations: Annotation[] = [
			{
				kind: 'brush',
				points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
				color: '#ef4444',
				strokeWidth: 3,
			},
		];

		await flattenAnnotations(screenshotBlob, annotations, 1024, 768);

		expect(mockRenderAll).toHaveBeenCalledWith(mockCtx, 1024, 768, annotations);
	});

	it('calls canvasToBlob on the output canvas', async () => {
		await flattenAnnotations(screenshotBlob, [], 800, 600);
		expect(mockCanvasToBlob).toHaveBeenCalledTimes(1);
		// The argument should be a canvas element
		const arg = mockCanvasToBlob.mock.calls[0][0];
		expect(arg.tagName).toBe('CANVAS');
		expect(arg.width).toBe(800);
		expect(arg.height).toBe(600);
	});

	it('creates and revokes object URL', async () => {
		await flattenAnnotations(screenshotBlob, [], 1024, 768);
		expect(URL.createObjectURL).toHaveBeenCalledWith(screenshotBlob);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
	});

	it('revokes object URL even on error', async () => {
		mockCanvasToBlob.mockRejectedValue(new Error('toBlob failed'));

		await expect(
			flattenAnnotations(screenshotBlob, [], 1024, 768),
		).rejects.toThrow('toBlob failed');

		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
	});

	it('sets canvas dimensions to provided width and height', async () => {
		await flattenAnnotations(screenshotBlob, [], 2048, 1536);
		const canvas = mockCanvasToBlob.mock.calls[0][0];
		expect(canvas.width).toBe(2048);
		expect(canvas.height).toBe(1536);
	});
});
