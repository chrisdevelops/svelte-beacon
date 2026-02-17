// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { createAnnotationState } from '../internal/annotation-state.svelte.js';
import { DEFAULT_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE, UNDO_STACK_LIMIT } from '../internal/annotation-types.js';
import type { Point } from '../internal/annotation-types.js';

afterEach(() => {
	cleanup();
});

describe('createAnnotationState', () => {
	// ------------------------------------------------------------------ //
	// Initial state                                                       //
	// ------------------------------------------------------------------ //

	describe('initial state', () => {
		it('has default tool, color, and stroke width', () => {
			const s = createAnnotationState();
			expect(s.tool).toBe('brush');
			expect(s.color).toBe(DEFAULT_COLOR);
			expect(s.strokeWidth).toBe(DEFAULT_STROKE_WIDTH);
			expect(s.fontSize).toBe(DEFAULT_FONT_SIZE);
		});

		it('starts with empty annotations', () => {
			const s = createAnnotationState();
			expect(s.annotations).toEqual([]);
			expect(s.activeAnnotation).toBe(null);
		});

		it('starts with no text input', () => {
			const s = createAnnotationState();
			expect(s.textInputPosition).toBe(null);
			expect(s.textInputValue).toBe('');
		});

		it('cannot undo or redo initially', () => {
			const s = createAnnotationState();
			expect(s.canUndo).toBe(false);
			expect(s.canRedo).toBe(false);
		});
	});

	// ------------------------------------------------------------------ //
	// Tool switching                                                       //
	// ------------------------------------------------------------------ //

	describe('tool switching', () => {
		it('switches to arrow tool', () => {
			const s = createAnnotationState();
			flushSync(() => s.setTool('arrow'));
			expect(s.tool).toBe('arrow');
		});

		it('switches to text tool', () => {
			const s = createAnnotationState();
			flushSync(() => s.setTool('text'));
			expect(s.tool).toBe('text');
		});

		it('switches back to brush', () => {
			const s = createAnnotationState();
			flushSync(() => s.setTool('arrow'));
			flushSync(() => s.setTool('brush'));
			expect(s.tool).toBe('brush');
		});
	});

	// ------------------------------------------------------------------ //
	// Color and stroke                                                     //
	// ------------------------------------------------------------------ //

	describe('color and stroke', () => {
		it('changes color', () => {
			const s = createAnnotationState();
			flushSync(() => s.setColor('#3b82f6'));
			expect(s.color).toBe('#3b82f6');
		});

		it('changes stroke width', () => {
			const s = createAnnotationState();
			flushSync(() => s.setStrokeWidth(8));
			expect(s.strokeWidth).toBe(8);
		});

		it('changes font size', () => {
			const s = createAnnotationState();
			flushSync(() => s.setFontSize(24));
			expect(s.fontSize).toBe(24);
		});
	});

	// ------------------------------------------------------------------ //
	// Brush annotations                                                    //
	// ------------------------------------------------------------------ //

	describe('brush annotations', () => {
		it('starts a brush stroke', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0.1, y: 0.2 }));
			expect(s.activeAnnotation).toEqual({
				kind: 'brush',
				points: [{ x: 0.1, y: 0.2 }],
				color: DEFAULT_COLOR,
				strokeWidth: DEFAULT_STROKE_WIDTH,
			});
		});

		it('continues a brush stroke', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0.1, y: 0.2 }));
			flushSync(() => s.continueBrush({ x: 0.3, y: 0.4 }));
			expect(s.activeAnnotation?.kind).toBe('brush');
			if (s.activeAnnotation?.kind === 'brush') {
				expect(s.activeAnnotation.points).toHaveLength(2);
			}
		});

		it('commits a brush stroke with 2+ points', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0.1, y: 0.2 }));
			flushSync(() => s.continueBrush({ x: 0.3, y: 0.4 }));
			flushSync(() => s.commitBrush());
			expect(s.annotations).toHaveLength(1);
			expect(s.annotations[0].kind).toBe('brush');
			expect(s.activeAnnotation).toBe(null);
		});

		it('discards single-point brush stroke', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0.1, y: 0.2 }));
			flushSync(() => s.commitBrush());
			expect(s.annotations).toHaveLength(0);
			expect(s.activeAnnotation).toBe(null);
		});

		it('uses current color and stroke width', () => {
			const s = createAnnotationState();
			flushSync(() => s.setColor('#000000'));
			flushSync(() => s.setStrokeWidth(5));
			flushSync(() => s.startBrush({ x: 0, y: 0 }));
			expect(s.activeAnnotation).toMatchObject({
				color: '#000000',
				strokeWidth: 5,
			});
		});
	});

	// ------------------------------------------------------------------ //
	// Arrow annotations                                                    //
	// ------------------------------------------------------------------ //

	describe('arrow annotations', () => {
		it('starts an arrow', () => {
			const s = createAnnotationState();
			flushSync(() => s.startArrow({ x: 0.1, y: 0.2 }));
			expect(s.activeAnnotation).toEqual({
				kind: 'arrow',
				start: { x: 0.1, y: 0.2 },
				end: { x: 0.1, y: 0.2 },
				color: DEFAULT_COLOR,
				strokeWidth: DEFAULT_STROKE_WIDTH,
			});
		});

		it('updates arrow end point', () => {
			const s = createAnnotationState();
			flushSync(() => s.startArrow({ x: 0.1, y: 0.2 }));
			flushSync(() => s.updateArrow({ x: 0.5, y: 0.6 }));
			if (s.activeAnnotation?.kind === 'arrow') {
				expect(s.activeAnnotation.end).toEqual({ x: 0.5, y: 0.6 });
			}
		});

		it('commits arrow with non-zero length', () => {
			const s = createAnnotationState();
			flushSync(() => s.startArrow({ x: 0.1, y: 0.2 }));
			flushSync(() => s.updateArrow({ x: 0.5, y: 0.6 }));
			flushSync(() => s.commitArrow());
			expect(s.annotations).toHaveLength(1);
			expect(s.annotations[0].kind).toBe('arrow');
			expect(s.activeAnnotation).toBe(null);
		});

		it('discards zero-length arrow', () => {
			const s = createAnnotationState();
			flushSync(() => s.startArrow({ x: 0.5, y: 0.5 }));
			flushSync(() => s.commitArrow());
			expect(s.annotations).toHaveLength(0);
		});
	});

	// ------------------------------------------------------------------ //
	// Text annotations                                                     //
	// ------------------------------------------------------------------ //

	describe('text annotations', () => {
		it('starts text input at position', () => {
			const s = createAnnotationState();
			flushSync(() => s.startText({ x: 0.3, y: 0.4 }));
			expect(s.textInputPosition).toEqual({ x: 0.3, y: 0.4 });
			expect(s.textInputValue).toBe('');
		});

		it('updates text input value', () => {
			const s = createAnnotationState();
			flushSync(() => s.startText({ x: 0.3, y: 0.4 }));
			flushSync(() => s.updateTextInput('Hello'));
			expect(s.textInputValue).toBe('Hello');
		});

		it('commits non-empty text', () => {
			const s = createAnnotationState();
			flushSync(() => s.startText({ x: 0.3, y: 0.4 }));
			flushSync(() => s.updateTextInput('Bug here'));
			flushSync(() => s.commitText());
			expect(s.annotations).toHaveLength(1);
			expect(s.annotations[0]).toEqual({
				kind: 'text',
				position: { x: 0.3, y: 0.4 },
				content: 'Bug here',
				color: DEFAULT_COLOR,
				fontSize: DEFAULT_FONT_SIZE,
			});
			expect(s.textInputPosition).toBe(null);
			expect(s.textInputValue).toBe('');
		});

		it('discards empty text', () => {
			const s = createAnnotationState();
			flushSync(() => s.startText({ x: 0.3, y: 0.4 }));
			flushSync(() => s.updateTextInput('   '));
			flushSync(() => s.commitText());
			expect(s.annotations).toHaveLength(0);
		});

		it('cancels text input', () => {
			const s = createAnnotationState();
			flushSync(() => s.startText({ x: 0.3, y: 0.4 }));
			flushSync(() => s.updateTextInput('some text'));
			flushSync(() => s.cancelText());
			expect(s.textInputPosition).toBe(null);
			expect(s.textInputValue).toBe('');
			expect(s.annotations).toHaveLength(0);
		});
	});

	// ------------------------------------------------------------------ //
	// Undo / Redo                                                          //
	// ------------------------------------------------------------------ //

	describe('undo/redo', () => {
		function commitBrushStroke(s: ReturnType<typeof createAnnotationState>, start: Point, end: Point): void {
			flushSync(() => s.startBrush(start));
			flushSync(() => s.continueBrush(end));
			flushSync(() => s.commitBrush());
		}

		it('can undo after committing', () => {
			const s = createAnnotationState();
			commitBrushStroke(s, { x: 0, y: 0 }, { x: 1, y: 1 });
			expect(s.canUndo).toBe(true);
			flushSync(() => s.undo());
			expect(s.annotations).toHaveLength(0);
			expect(s.canUndo).toBe(false);
		});

		it('can redo after undo', () => {
			const s = createAnnotationState();
			commitBrushStroke(s, { x: 0, y: 0 }, { x: 1, y: 1 });
			flushSync(() => s.undo());
			expect(s.canRedo).toBe(true);
			flushSync(() => s.redo());
			expect(s.annotations).toHaveLength(1);
			expect(s.canRedo).toBe(false);
		});

		it('clears redo stack on new commit', () => {
			const s = createAnnotationState();
			commitBrushStroke(s, { x: 0, y: 0 }, { x: 1, y: 1 });
			flushSync(() => s.undo());
			expect(s.canRedo).toBe(true);
			commitBrushStroke(s, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
			expect(s.canRedo).toBe(false);
		});

		it('handles multiple undo/redo steps', () => {
			const s = createAnnotationState();
			commitBrushStroke(s, { x: 0, y: 0 }, { x: 0.1, y: 0.1 });
			commitBrushStroke(s, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 });
			commitBrushStroke(s, { x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 });
			expect(s.annotations).toHaveLength(3);

			flushSync(() => s.undo());
			expect(s.annotations).toHaveLength(2);

			flushSync(() => s.undo());
			expect(s.annotations).toHaveLength(1);

			flushSync(() => s.redo());
			expect(s.annotations).toHaveLength(2);
		});

		it('does nothing on undo with empty stack', () => {
			const s = createAnnotationState();
			flushSync(() => s.undo());
			expect(s.annotations).toHaveLength(0);
		});

		it('does nothing on redo with empty stack', () => {
			const s = createAnnotationState();
			flushSync(() => s.redo());
			expect(s.annotations).toHaveLength(0);
		});

		it('caps undo stack at limit', () => {
			const s = createAnnotationState();
			for (let i = 0; i < UNDO_STACK_LIMIT + 10; i++) {
				commitBrushStroke(s, { x: i * 0.01, y: 0 }, { x: i * 0.01 + 0.005, y: 0.01 });
			}
			// Should be capped — undo all and check we can't go beyond limit
			let undoCount = 0;
			while (s.canUndo) {
				flushSync(() => s.undo());
				undoCount++;
			}
			expect(undoCount).toBe(UNDO_STACK_LIMIT);
		});
	});

	// ------------------------------------------------------------------ //
	// Clear                                                                //
	// ------------------------------------------------------------------ //

	describe('clear', () => {
		it('clears all annotations', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0, y: 0 }));
			flushSync(() => s.continueBrush({ x: 1, y: 1 }));
			flushSync(() => s.commitBrush());
			expect(s.annotations).toHaveLength(1);

			flushSync(() => s.clear());
			expect(s.annotations).toHaveLength(0);
			expect(s.activeAnnotation).toBe(null);
		});

		it('clear is undoable', () => {
			const s = createAnnotationState();
			flushSync(() => s.startBrush({ x: 0, y: 0 }));
			flushSync(() => s.continueBrush({ x: 1, y: 1 }));
			flushSync(() => s.commitBrush());
			flushSync(() => s.clear());
			expect(s.annotations).toHaveLength(0);

			flushSync(() => s.undo());
			expect(s.annotations).toHaveLength(1);
		});

		it('does nothing when already empty', () => {
			const s = createAnnotationState();
			flushSync(() => s.clear());
			expect(s.canUndo).toBe(false);
		});
	});
});
