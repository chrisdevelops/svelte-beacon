import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBrush, renderArrow, renderText, renderAll } from '../internal/annotation-renderer.js';
import type { BrushAnnotation, ArrowAnnotation, TextAnnotation } from '../internal/annotation-types.js';

function createMockContext(): CanvasRenderingContext2D {
	return {
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
		lineCap: 'butt' as CanvasLineCap,
		lineJoin: 'miter' as CanvasLineJoin,
		font: '',
		textBaseline: 'alphabetic' as CanvasTextBaseline,
		shadowColor: '',
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
	} as unknown as CanvasRenderingContext2D;
}

describe('renderBrush', () => {
	it('draws a path through all points', () => {
		const ctx = createMockContext();
		const annotation: BrushAnnotation = {
			kind: 'brush',
			points: [
				{ x: 0.1, y: 0.2 },
				{ x: 0.3, y: 0.4 },
				{ x: 0.5, y: 0.6 },
			],
			color: '#ef4444',
			strokeWidth: 3,
		};

		renderBrush(ctx, 1000, 800, annotation);

		expect(ctx.beginPath).toHaveBeenCalledTimes(1);
		expect(ctx.moveTo).toHaveBeenCalledWith(100, 160);
		expect(ctx.lineTo).toHaveBeenCalledTimes(2);
		expect(ctx.lineTo).toHaveBeenCalledWith(300, 320);
		expect(ctx.lineTo).toHaveBeenCalledWith(500, 480);
		expect(ctx.stroke).toHaveBeenCalledTimes(1);
	});

	it('sets stroke style and line properties', () => {
		const ctx = createMockContext();
		const annotation: BrushAnnotation = {
			kind: 'brush',
			points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
			color: '#3b82f6',
			strokeWidth: 5,
		};

		renderBrush(ctx, 500, 400, annotation);

		expect(ctx.strokeStyle).toBe('#3b82f6');
		expect(ctx.lineWidth).toBe(5); // 5 * (500/500)
		expect(ctx.lineCap).toBe('round');
		expect(ctx.lineJoin).toBe('round');
	});

	it('skips rendering with fewer than 2 points', () => {
		const ctx = createMockContext();
		const annotation: BrushAnnotation = {
			kind: 'brush',
			points: [{ x: 0.5, y: 0.5 }],
			color: '#ef4444',
			strokeWidth: 3,
		};

		renderBrush(ctx, 1000, 800, annotation);

		expect(ctx.beginPath).not.toHaveBeenCalled();
	});

	it('scales stroke width proportionally to canvas size', () => {
		const ctx = createMockContext();
		const annotation: BrushAnnotation = {
			kind: 'brush',
			points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
			color: '#ef4444',
			strokeWidth: 3,
		};

		renderBrush(ctx, 1000, 800, annotation);

		expect(ctx.lineWidth).toBe(6); // 3 * (1000/500)
	});
});

describe('renderArrow', () => {
	it('draws a line from start to end', () => {
		const ctx = createMockContext();
		const annotation: ArrowAnnotation = {
			kind: 'arrow',
			start: { x: 0.1, y: 0.2 },
			end: { x: 0.8, y: 0.7 },
			color: '#22c55e',
			strokeWidth: 3,
		};

		renderArrow(ctx, 1000, 800, annotation);

		expect(ctx.beginPath).toHaveBeenCalled();
		expect(ctx.moveTo).toHaveBeenCalledWith(100, 160);
		expect(ctx.lineTo).toHaveBeenCalledWith(800, 560);
		expect(ctx.stroke).toHaveBeenCalled();
	});

	it('draws a filled arrowhead', () => {
		const ctx = createMockContext();
		const annotation: ArrowAnnotation = {
			kind: 'arrow',
			start: { x: 0, y: 0 },
			end: { x: 1, y: 0 },
			color: '#ef4444',
			strokeWidth: 3,
		};

		renderArrow(ctx, 500, 400, annotation);

		expect(ctx.fillStyle).toBe('#ef4444');
		expect(ctx.closePath).toHaveBeenCalled();
		expect(ctx.fill).toHaveBeenCalled();
	});

	it('sets stroke color and width', () => {
		const ctx = createMockContext();
		const annotation: ArrowAnnotation = {
			kind: 'arrow',
			start: { x: 0, y: 0 },
			end: { x: 1, y: 1 },
			color: '#a855f7',
			strokeWidth: 8,
		};

		renderArrow(ctx, 500, 400, annotation);

		expect(ctx.strokeStyle).toBe('#a855f7');
		expect(ctx.lineWidth).toBe(8); // 8 * (500/500)
	});
});

describe('renderText', () => {
	it('draws text at the correct position', () => {
		const ctx = createMockContext();
		const annotation: TextAnnotation = {
			kind: 'text',
			position: { x: 0.5, y: 0.3 },
			content: 'Bug here',
			color: '#ef4444',
			fontSize: 16,
		};

		renderText(ctx, 1000, 800, annotation);

		expect(ctx.fillText).toHaveBeenCalledWith('Bug here', 500, 240);
	});

	it('sets font with scaled size', () => {
		const ctx = createMockContext();
		const annotation: TextAnnotation = {
			kind: 'text',
			position: { x: 0.5, y: 0.5 },
			content: 'test',
			color: '#000000',
			fontSize: 16,
		};

		renderText(ctx, 1000, 800, annotation);

		// 16 * (1000/500) = 32
		expect(ctx.font).toContain('32px');
	});

	it('sets fill color and shadow', () => {
		const ctx = createMockContext();
		const annotation: TextAnnotation = {
			kind: 'text',
			position: { x: 0, y: 0 },
			content: 'hello',
			color: '#ffffff',
			fontSize: 16,
		};

		renderText(ctx, 500, 400, annotation);

		expect(ctx.fillStyle).toBe('#ffffff');
		// Shadow should be reset after rendering
		expect(ctx.shadowColor).toBe('transparent');
		expect(ctx.shadowBlur).toBe(0);
	});

	it('uses top text baseline', () => {
		const ctx = createMockContext();
		const annotation: TextAnnotation = {
			kind: 'text',
			position: { x: 0, y: 0 },
			content: 'test',
			color: '#000000',
			fontSize: 16,
		};

		renderText(ctx, 500, 400, annotation);

		expect(ctx.textBaseline).toBe('top');
	});
});

describe('renderAll', () => {
	it('renders multiple annotation types', () => {
		const ctx = createMockContext();
		const annotations = [
			{
				kind: 'brush' as const,
				points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
				color: '#ef4444',
				strokeWidth: 3,
			},
			{
				kind: 'arrow' as const,
				start: { x: 0, y: 0 },
				end: { x: 1, y: 1 },
				color: '#3b82f6',
				strokeWidth: 3,
			},
			{
				kind: 'text' as const,
				position: { x: 0.5, y: 0.5 },
				content: 'test',
				color: '#000000',
				fontSize: 16,
			},
		];

		renderAll(ctx, 500, 400, annotations);

		// brush stroke + arrow line + arrow head = 3 beginPath, plus text fillText
		expect(ctx.stroke).toHaveBeenCalledTimes(2); // brush + arrow shaft
		expect(ctx.fill).toHaveBeenCalledTimes(1); // arrow head
		expect(ctx.fillText).toHaveBeenCalledTimes(1); // text
	});

	it('handles empty annotation list', () => {
		const ctx = createMockContext();
		renderAll(ctx, 500, 400, []);
		expect(ctx.beginPath).not.toHaveBeenCalled();
	});
});
