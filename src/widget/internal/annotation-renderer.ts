/**
 * Pure rendering functions for annotations.
 * Each function takes a canvas 2D context, canvas dimensions, and an annotation.
 * Coordinates are normalized (0..1) and scaled to canvas pixels.
 */

import type {
	Annotation,
	BrushAnnotation,
	ArrowAnnotation,
	TextAnnotation,
} from './annotation-types.js';

/**
 * Render a brush stroke annotation.
 */
export function renderBrush(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	annotation: BrushAnnotation,
): void {
	const { points, color, strokeWidth } = annotation;
	if (points.length < 2) return;

	ctx.beginPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = strokeWidth * (width / 500);
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	ctx.moveTo(points[0].x * width, points[0].y * height);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i].x * width, points[i].y * height);
	}
	ctx.stroke();
}

/**
 * Render an arrow annotation with a triangular arrowhead.
 */
export function renderArrow(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	annotation: ArrowAnnotation,
): void {
	const { start, end, color, strokeWidth } = annotation;
	const sx = start.x * width;
	const sy = start.y * height;
	const ex = end.x * width;
	const ey = end.y * height;

	const scaledWidth = strokeWidth * (width / 500);
	const angle = Math.atan2(ey - sy, ex - sx);
	const headLength = scaledWidth * 5;

	// Shaft
	ctx.beginPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = scaledWidth;
	ctx.lineCap = 'round';
	ctx.moveTo(sx, sy);
	ctx.lineTo(ex, ey);
	ctx.stroke();

	// Arrowhead
	ctx.beginPath();
	ctx.fillStyle = color;
	ctx.moveTo(ex, ey);
	ctx.lineTo(
		ex - headLength * Math.cos(angle - Math.PI / 6),
		ey - headLength * Math.sin(angle - Math.PI / 6),
	);
	ctx.lineTo(
		ex - headLength * Math.cos(angle + Math.PI / 6),
		ey - headLength * Math.sin(angle + Math.PI / 6),
	);
	ctx.closePath();
	ctx.fill();
}

/**
 * Render a text annotation with a subtle shadow for readability.
 */
export function renderText(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	annotation: TextAnnotation,
): void {
	const { position, content, color, fontSize } = annotation;
	const scaledSize = fontSize * (width / 500);
	const x = position.x * width;
	const y = position.y * height;

	ctx.font = `${scaledSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
	ctx.textBaseline = 'top';

	// Shadow for readability
	ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
	ctx.shadowBlur = 2;
	ctx.shadowOffsetX = 1;
	ctx.shadowOffsetY = 1;

	ctx.fillStyle = color;
	ctx.fillText(content, x, y);

	// Reset shadow
	ctx.shadowColor = 'transparent';
	ctx.shadowBlur = 0;
	ctx.shadowOffsetX = 0;
	ctx.shadowOffsetY = 0;
}

/**
 * Render all annotations onto a canvas context.
 */
export function renderAll(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	annotations: readonly Annotation[],
): void {
	for (const annotation of annotations) {
		switch (annotation.kind) {
			case 'brush':
				renderBrush(ctx, width, height, annotation);
				break;
			case 'arrow':
				renderArrow(ctx, width, height, annotation);
				break;
			case 'text':
				renderText(ctx, width, height, annotation);
				break;
		}
	}
}
