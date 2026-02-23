// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import { createWidgetState } from '../internal/shared-state.svelte.js';

describe('createWidgetState', () => {
	it('starts in idle view', () => {
		const state = createWidgetState();
		expect(state.view).toBe('idle');
		expect(state.isOpen).toBe(false);
	});

	it('has default form values', () => {
		const state = createWidgetState();
		expect(state.type).toBe('bug');
		expect(state.priority).toBe('medium');
		expect(state.description).toBe('');
		expect(state.email).toBe('');
	});

	it('defaults to bottom-right position', () => {
		const state = createWidgetState();
		expect(state.position).toBe('bottom-right');
	});

	it('uses provided position override', () => {
		const state = createWidgetState({ position: 'top-left' });
		expect(state.position).toBe('top-left');
	});

	it('opens to form view', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		expect(state.view).toBe('form');
		expect(state.isOpen).toBe(true);
	});

	it('closes from form view', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		flushSync(() => state.close());
		expect(state.view).toBe('idle');
		expect(state.isOpen).toBe(false);
	});

	it('does not double-open', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		expect(state.view).toBe('form');
		// Opening again when already open should stay in form
		flushSync(() => state.open());
		expect(state.view).toBe('form');
	});

	it('sets form field values', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.type = 'feature';
			state.priority = 'critical';
			state.description = 'Need this';
			state.email = 'test@example.com';
		});
		expect(state.type).toBe('feature');
		expect(state.priority).toBe('critical');
		expect(state.description).toBe('Need this');
		expect(state.email).toBe('test@example.com');
	});

	it('tracks submitting state', () => {
		const state = createWidgetState();
		expect(state.submitting).toBe(false);
		flushSync(() => state.setSubmitting(true));
		expect(state.submitting).toBe(true);
		flushSync(() => state.setSubmitting(false));
		expect(state.submitting).toBe(false);
	});

	it('transitions to success on ok result', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		flushSync(() => state.setSubmitting(true));
		flushSync(() =>
			state.setResult({
				ok: true,
				data: { id: 'abc', public_id: 1 },
			}),
		);
		expect(state.view).toBe('success');
		expect(state.submitting).toBe(false);
		expect(state.lastResult).toEqual({
			ok: true,
			data: { id: 'abc', public_id: 1 },
		});
	});

	it('transitions to error on failed result', () => {
		const state = createWidgetState();
		flushSync(() => state.open());
		flushSync(() => state.setSubmitting(true));
		flushSync(() =>
			state.setResult({
				ok: false,
				error: 'Server error',
			}),
		);
		expect(state.view).toBe('error');
		expect(state.submitting).toBe(false);
	});

	it('resets all state', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.type = 'feature';
			state.priority = 'critical';
			state.description = 'Test';
			state.email = 'a@b.com';
		});
		flushSync(() => state.reset());
		expect(state.view).toBe('idle');
		expect(state.type).toBe('bug');
		expect(state.priority).toBe('medium');
		expect(state.description).toBe('');
		expect(state.email).toBe('');
		expect(state.submitting).toBe(false);
		expect(state.lastResult).toBe(null);
		expect(state.screenshot).toBe(null);
		expect(state.selectedElement).toBe(null);
		expect(state.selectingElement).toBe(false);
	});

	it('applies config via setConfig', () => {
		const state = createWidgetState();
		flushSync(() =>
			state.setConfig({
				screenshot: true,
				elementSelector: true,
				aiAssist: false,
				requireEmail: true,
				position: 'bottom-left',
			}),
		);
		expect(state.config.requireEmail).toBe(true);
		expect(state.config.screenshot).toBe(true);
	});

	it('position override takes precedence over config', () => {
		const state = createWidgetState({ position: 'top-right' });
		flushSync(() =>
			state.setConfig({
				screenshot: false,
				elementSelector: false,
				aiAssist: false,
				requireEmail: false,
				position: 'bottom-left',
			}),
		);
		expect(state.position).toBe('top-right');
	});

	// Screenshot state
	it('starts with no screenshot', () => {
		const state = createWidgetState();
		expect(state.screenshot).toBe(null);
		expect(state.screenshotUrl).toBe(null);
	});

	it('sets screenshot blob', () => {
		const state = createWidgetState();
		const blob = new Blob(['test'], { type: 'image/png' });
		flushSync(() => state.setScreenshot(blob));
		expect(state.screenshot).toBe(blob);
	});

	it('creates object URL for screenshot', () => {
		const state = createWidgetState();
		const blob = new Blob(['test'], { type: 'image/png' });
		flushSync(() => state.setScreenshot(blob));
		expect(state.screenshotUrl).toMatch(/^blob:/);
	});

	it('clears screenshot', () => {
		const state = createWidgetState();
		const blob = new Blob(['test'], { type: 'image/png' });
		flushSync(() => state.setScreenshot(blob));
		flushSync(() => state.clearScreenshot());
		expect(state.screenshot).toBe(null);
	});

	it('revokes object URL when screenshot is cleared', () => {
		const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
		const state = createWidgetState();
		const blob = new Blob(['test'], { type: 'image/png' });
		flushSync(() => state.setScreenshot(blob));
		const url = state.screenshotUrl;
		flushSync(() => state.clearScreenshot());
		expect(revokeSpy).toHaveBeenCalledWith(url);
		revokeSpy.mockRestore();
	});

	it('close() clears screenshot', () => {
		const state = createWidgetState();
		const blob = new Blob(['test'], { type: 'image/png' });
		flushSync(() => {
			state.open();
			state.setScreenshot(blob);
		});
		flushSync(() => state.close());
		expect(state.screenshot).toBe(null);
	});

	// Element selector state
	it('starts with no element selected', () => {
		const state = createWidgetState();
		expect(state.selectedElement).toBe(null);
		expect(state.selectingElement).toBe(false);
	});

	it('starts element selection', () => {
		const state = createWidgetState();
		flushSync(() => state.startElementSelection());
		expect(state.selectingElement).toBe(true);
		expect(state.selectedElement).toBe(null);
	});

	it('finishes element selection with selector', () => {
		const state = createWidgetState();
		flushSync(() => state.startElementSelection());
		flushSync(() => state.finishElementSelection('#my-button'));
		expect(state.selectingElement).toBe(false);
		expect(state.selectedElement).toBe('#my-button');
	});

	it('cancels element selection', () => {
		const state = createWidgetState();
		flushSync(() => state.startElementSelection());
		flushSync(() => state.cancelElementSelection());
		expect(state.selectingElement).toBe(false);
		expect(state.selectedElement).toBe(null);
	});

	it('reset() clears element selection', () => {
		const state = createWidgetState();
		flushSync(() => state.startElementSelection());
		flushSync(() => state.finishElementSelection('#foo'));
		flushSync(() => state.reset());
		expect(state.selectedElement).toBe(null);
		expect(state.selectingElement).toBe(false);
	});

	it('close() clears element selection', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.startElementSelection();
			state.finishElementSelection('#bar');
		});
		flushSync(() => state.close());
		expect(state.selectedElement).toBe(null);
		expect(state.selectingElement).toBe(false);
	});

	// AI assist state
	it('starts with idle AI state', () => {
		const state = createWidgetState();
		expect(state.aiAssistState).toBe('idle');
		expect(state.aiSuggestion).toBe(null);
		expect(state.aiError).toBe(null);
	});

	it('transitions to loading AI state', () => {
		const state = createWidgetState();
		flushSync(() => state.setAILoading());
		expect(state.aiAssistState).toBe('loading');
		expect(state.aiSuggestion).toBe(null);
		expect(state.aiError).toBe(null);
	});

	it('sets AI suggestion', () => {
		const state = createWidgetState();
		const suggestion = {
			improved_description: 'Better desc',
			suggested_type: 'bug' as const,
			suggested_priority: 'high' as const,
			reasoning: 'Made it clearer',
		};
		flushSync(() => state.setAISuggestion(suggestion));
		expect(state.aiAssistState).toBe('ready');
		expect(state.aiSuggestion).toEqual(suggestion);
		expect(state.aiError).toBe(null);
	});

	it('sets AI error', () => {
		const state = createWidgetState();
		flushSync(() => state.setAIError('Something went wrong'));
		expect(state.aiAssistState).toBe('error');
		expect(state.aiSuggestion).toBe(null);
		expect(state.aiError).toBe('Something went wrong');
	});

	it('clears AI suggestion', () => {
		const state = createWidgetState();
		const suggestion = {
			improved_description: 'Better desc',
			suggested_type: 'bug' as const,
			suggested_priority: 'high' as const,
			reasoning: 'Made it clearer',
		};
		flushSync(() => state.setAISuggestion(suggestion));
		flushSync(() => state.clearAISuggestion());
		expect(state.aiAssistState).toBe('idle');
		expect(state.aiSuggestion).toBe(null);
	});

	it('accepts AI suggestion and applies to form fields', () => {
		const state = createWidgetState();
		const suggestion = {
			improved_description: 'Better desc',
			suggested_type: 'feature' as const,
			suggested_priority: 'high' as const,
			reasoning: 'Made it clearer',
		};
		flushSync(() => state.setAISuggestion(suggestion));
		flushSync(() => state.acceptAISuggestion());
		expect(state.description).toBe('Better desc');
		expect(state.type).toBe('feature');
		expect(state.priority).toBe('high');
		expect(state.aiAssistState).toBe('idle');
		expect(state.aiSuggestion).toBe(null);
	});

	it('reset() clears AI state', () => {
		const state = createWidgetState();
		const suggestion = {
			improved_description: 'Better desc',
			suggested_type: 'bug' as const,
			suggested_priority: 'high' as const,
			reasoning: 'Made it clearer',
		};
		flushSync(() => state.setAISuggestion(suggestion));
		flushSync(() => state.reset());
		expect(state.aiAssistState).toBe('idle');
		expect(state.aiSuggestion).toBe(null);
		expect(state.aiError).toBe(null);
	});

	it('close() clears AI state', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.open();
			state.setAIError('oops');
		});
		flushSync(() => state.close());
		expect(state.aiAssistState).toBe('idle');
		expect(state.aiError).toBe(null);
	});

	it('acceptAISuggestion does nothing when no suggestion', () => {
		const state = createWidgetState();
		flushSync(() => {
			state.description = 'original';
			state.type = 'bug';
		});
		flushSync(() => state.acceptAISuggestion());
		expect(state.description).toBe('original');
		expect(state.type).toBe('bug');
	});

	// Config prop overrides
	describe('config prop overrides', () => {
		it('screenshot override takes precedence over server config', () => {
			const state = createWidgetState({ screenshot: true });
			expect(state.config.screenshot).toBe(true);
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: false,
					aiAssist: false,
					requireEmail: false,
					position: 'bottom-right',
				}),
			);
			expect(state.config.screenshot).toBe(true);
		});

		it('elementSelector override takes precedence over server config', () => {
			const state = createWidgetState({ elementSelector: true });
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: false,
					aiAssist: false,
					requireEmail: false,
					position: 'bottom-right',
				}),
			);
			expect(state.config.elementSelector).toBe(true);
		});

		it('aiAssist override takes precedence over server config', () => {
			const state = createWidgetState({ aiAssist: true });
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: false,
					aiAssist: false,
					requireEmail: false,
					position: 'bottom-right',
				}),
			);
			expect(state.config.aiAssist).toBe(true);
		});

		it('requireEmail override takes precedence over server config', () => {
			const state = createWidgetState({ requireEmail: true });
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: false,
					aiAssist: false,
					requireEmail: false,
					position: 'bottom-right',
				}),
			);
			expect(state.config.requireEmail).toBe(true);
		});

		it('multiple overrides work together', () => {
			const state = createWidgetState({
				screenshot: true,
				aiAssist: true,
				position: 'top-left',
			});
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: true,
					aiAssist: false,
					requireEmail: true,
					position: 'bottom-right',
				}),
			);
			// Overridden
			expect(state.config.screenshot).toBe(true);
			expect(state.config.aiAssist).toBe(true);
			expect(state.config.position).toBe('top-left');
			expect(state.position).toBe('top-left');
			// Falls through to server config
			expect(state.config.elementSelector).toBe(true);
			expect(state.config.requireEmail).toBe(true);
		});

		it('undefined props fall through to server config', () => {
			const state = createWidgetState({ screenshot: true });
			flushSync(() =>
				state.setConfig({
					screenshot: false,
					elementSelector: true,
					aiAssist: true,
					requireEmail: true,
					position: 'top-right',
				}),
			);
			// Only screenshot is overridden
			expect(state.config.screenshot).toBe(true);
			// Rest come from server config
			expect(state.config.elementSelector).toBe(true);
			expect(state.config.aiAssist).toBe(true);
			expect(state.config.requireEmail).toBe(true);
			expect(state.config.position).toBe('top-right');
		});
	});
});
