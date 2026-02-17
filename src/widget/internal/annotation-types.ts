/**
 * Annotation data types and constants for the screenshot annotation canvas.
 * All coordinates are normalized to 0..1 ratios relative to screenshot dimensions.
 */

export type AnnotationTool = 'brush' | 'arrow' | 'text';

export interface Point {
	x: number;
	y: number;
}

export interface BrushAnnotation {
	kind: 'brush';
	points: Point[];
	color: string;
	strokeWidth: number;
}

export interface ArrowAnnotation {
	kind: 'arrow';
	start: Point;
	end: Point;
	color: string;
	strokeWidth: number;
}

export interface TextAnnotation {
	kind: 'text';
	position: Point;
	content: string;
	color: string;
	fontSize: number;
}

export type Annotation = BrushAnnotation | ArrowAnnotation | TextAnnotation;

export const COLOR_PALETTE: readonly string[] = [
	'#ef4444', // red
	'#f97316', // orange
	'#eab308', // yellow
	'#22c55e', // green
	'#3b82f6', // blue
	'#a855f7', // purple
	'#ffffff', // white
	'#000000', // black
] as const;

export const DEFAULT_COLOR = '#ef4444';

export const STROKE_WIDTHS: readonly number[] = [2, 3, 5, 8] as const;

export const DEFAULT_STROKE_WIDTH = 3;

export const DEFAULT_FONT_SIZE = 16;

export const UNDO_STACK_LIMIT = 50;
