/**
 * Reactive annotation state factory.
 * Follows the createWidgetState() pattern — internal $state variables,
 * returned object with getters and action methods.
 */

import type {
	Annotation,
	AnnotationTool,
	BrushAnnotation,
	ArrowAnnotation,
	TextAnnotation,
	Point,
} from './annotation-types.js';
import {
	DEFAULT_COLOR,
	DEFAULT_STROKE_WIDTH,
	DEFAULT_FONT_SIZE,
	UNDO_STACK_LIMIT,
} from './annotation-types.js';

export interface AnnotationState {
	// Tool selection
	readonly tool: AnnotationTool;
	readonly color: string;
	readonly strokeWidth: number;
	readonly fontSize: number;

	// Annotations
	readonly annotations: readonly Annotation[];
	readonly activeAnnotation: Annotation | null;

	// Text input
	readonly textInputPosition: Point | null;
	readonly textInputValue: string;

	// Undo/redo
	readonly canUndo: boolean;
	readonly canRedo: boolean;

	// Tool setters
	setTool(tool: AnnotationTool): void;
	setColor(color: string): void;
	setStrokeWidth(width: number): void;
	setFontSize(size: number): void;

	// Drawing actions
	startBrush(point: Point): void;
	continueBrush(point: Point): void;
	commitBrush(): void;

	startArrow(point: Point): void;
	updateArrow(end: Point): void;
	commitArrow(): void;

	startText(position: Point): void;
	updateTextInput(value: string): void;
	commitText(): void;
	cancelText(): void;

	// History
	undo(): void;
	redo(): void;
	clear(): void;
}

export function createAnnotationState(): AnnotationState {
	let tool = $state<AnnotationTool>('brush');
	let color = $state(DEFAULT_COLOR);
	let strokeWidth = $state(DEFAULT_STROKE_WIDTH);
	let fontSize = $state(DEFAULT_FONT_SIZE);

	let annotations = $state<Annotation[]>([]);
	let activeAnnotation = $state<Annotation | null>(null);

	let textInputPosition = $state<Point | null>(null);
	let textInputValue = $state('');

	let undoStack = $state<Annotation[][]>([]);
	let redoStack = $state<Annotation[][]>([]);

	const canUndo = $derived(undoStack.length > 0);
	const canRedo = $derived(redoStack.length > 0);

	function pushUndoState(): void {
		undoStack = [...undoStack, [...annotations]].slice(-UNDO_STACK_LIMIT);
		redoStack = [];
	}

	return {
		get tool() { return tool; },
		get color() { return color; },
		get strokeWidth() { return strokeWidth; },
		get fontSize() { return fontSize; },

		get annotations() { return annotations; },
		get activeAnnotation() { return activeAnnotation; },

		get textInputPosition() { return textInputPosition; },
		get textInputValue() { return textInputValue; },

		get canUndo() { return canUndo; },
		get canRedo() { return canRedo; },

		setTool(t: AnnotationTool) {
			tool = t;
		},

		setColor(c: string) {
			color = c;
		},

		setStrokeWidth(w: number) {
			strokeWidth = w;
		},

		setFontSize(s: number) {
			fontSize = s;
		},

		// Brush
		startBrush(point: Point) {
			activeAnnotation = {
				kind: 'brush',
				points: [point],
				color,
				strokeWidth,
			};
		},

		continueBrush(point: Point) {
			if (activeAnnotation?.kind === 'brush') {
				activeAnnotation = {
					...activeAnnotation,
					points: [...activeAnnotation.points, point],
				};
			}
		},

		commitBrush() {
			if (activeAnnotation?.kind === 'brush' && activeAnnotation.points.length >= 2) {
				pushUndoState();
				annotations = [...annotations, activeAnnotation];
			}
			activeAnnotation = null;
		},

		// Arrow
		startArrow(point: Point) {
			activeAnnotation = {
				kind: 'arrow',
				start: point,
				end: point,
				color,
				strokeWidth,
			};
		},

		updateArrow(end: Point) {
			if (activeAnnotation?.kind === 'arrow') {
				activeAnnotation = {
					...activeAnnotation,
					end,
				};
			}
		},

		commitArrow() {
			if (activeAnnotation?.kind === 'arrow') {
				const a = activeAnnotation as ArrowAnnotation;
				const dx = a.end.x - a.start.x;
				const dy = a.end.y - a.start.y;
				if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
					pushUndoState();
					annotations = [...annotations, activeAnnotation];
				}
			}
			activeAnnotation = null;
		},

		// Text
		startText(position: Point) {
			textInputPosition = position;
			textInputValue = '';
		},

		updateTextInput(value: string) {
			textInputValue = value;
		},

		commitText() {
			if (textInputPosition && textInputValue.trim().length > 0) {
				pushUndoState();
				const textAnnotation: TextAnnotation = {
					kind: 'text',
					position: textInputPosition,
					content: textInputValue.trim(),
					color,
					fontSize,
				};
				annotations = [...annotations, textAnnotation];
			}
			textInputPosition = null;
			textInputValue = '';
		},

		cancelText() {
			textInputPosition = null;
			textInputValue = '';
		},

		// History
		undo() {
			if (undoStack.length === 0) return;
			const previous = undoStack[undoStack.length - 1];
			undoStack = undoStack.slice(0, -1);
			redoStack = [...redoStack, [...annotations]];
			annotations = previous;
		},

		redo() {
			if (redoStack.length === 0) return;
			const next = redoStack[redoStack.length - 1];
			redoStack = redoStack.slice(0, -1);
			undoStack = [...undoStack, [...annotations]];
			annotations = next;
		},

		clear() {
			if (annotations.length === 0) return;
			pushUndoState();
			annotations = [];
			activeAnnotation = null;
		},
	};
}
