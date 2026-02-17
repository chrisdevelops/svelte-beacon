// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import AIAssist from '../internal/AIAssist.svelte';
import { createWidgetState } from '../internal/shared-state.svelte.js';

// Mock the API module
vi.mock('../internal/api.js', () => ({
	requestAIAssist: vi.fn(),
	fetchConfig: vi.fn(),
	submitFeedback: vi.fn(),
	submitFeedbackWithAttachments: vi.fn(),
}));

// Mock metadata
vi.mock('../internal/metadata.js', () => ({
	collectMetadata: vi.fn().mockReturnValue({ url: '/test' }),
}));

beforeEach(() => {
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

describe('AIAssist', () => {
	function renderComponent(stateOverrides?: (ws: ReturnType<typeof createWidgetState>) => void) {
		const ws = createWidgetState();
		if (stateOverrides) {
			flushSync(() => stateOverrides(ws));
		}
		const { container } = render(AIAssist, { props: { ws } });
		return { container, ws };
	}

	it('renders "Improve with AI" button in idle state', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'This is a test description that is long enough';
		});
		const btn = container.querySelector('.beacon-ai-assist-btn');
		expect(btn).not.toBeNull();
		expect(btn!.textContent).toContain('Improve with AI');
	});

	it('disables button when description is too short', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'short';
		});
		const btn = container.querySelector('.beacon-ai-assist-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('enables button when description is long enough', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'This is a long enough description';
		});
		const btn = container.querySelector('.beacon-ai-assist-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
	});

	it('disables button when submitting', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'This is a long enough description';
			ws.setSubmitting(true);
		});
		const btn = container.querySelector('.beacon-ai-assist-btn') as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it('shows loading state', () => {
		const { container } = renderComponent((ws) => {
			ws.setAILoading();
		});
		const loading = container.querySelector('.beacon-ai-assist-loading');
		expect(loading).not.toBeNull();
		expect(loading!.textContent).toContain('Improving description');
		// Should show spinner
		const spinner = container.querySelector('.beacon-ai-assist-spinner');
		expect(spinner).not.toBeNull();
	});

	it('does not show button during loading', () => {
		const { container } = renderComponent((ws) => {
			ws.setAILoading();
		});
		const btn = container.querySelector('.beacon-ai-assist-btn');
		expect(btn).toBeNull();
	});

	it('shows suggestion when ready', () => {
		const { container } = renderComponent((ws) => {
			ws.setAISuggestion({
				improved_description: 'Better description here',
				suggested_type: 'bug',
				suggested_priority: 'high',
				reasoning: 'Made it clearer',
			});
		});
		const suggestion = container.querySelector('.beacon-ai-assist-suggestion');
		expect(suggestion).not.toBeNull();
		expect(suggestion!.textContent).toContain('Better description here');
		expect(suggestion!.textContent).toContain('Made it clearer');
	});

	it('shows improved description in preview', () => {
		const { container } = renderComponent((ws) => {
			ws.setAISuggestion({
				improved_description: 'A well-structured bug report with clear steps',
				suggested_type: 'bug',
				suggested_priority: 'medium',
				reasoning: 'Restructured for clarity',
			});
		});
		const preview = container.querySelector('.beacon-ai-assist-preview-text');
		expect(preview).not.toBeNull();
		expect(preview!.textContent).toBe('A well-structured bug report with clear steps');
	});

	it('shows type/priority changes when different from current', () => {
		const { container } = renderComponent((ws) => {
			ws.type = 'bug';
			ws.priority = 'medium';
			ws.setAISuggestion({
				improved_description: 'Better description',
				suggested_type: 'feature',
				suggested_priority: 'high',
				reasoning: 'Changed',
			});
		});
		const changes = container.querySelectorAll('.beacon-ai-assist-change');
		expect(changes.length).toBe(2);
		// Check that changes show the transition
		const changeTexts = Array.from(changes).map((c) => c.textContent);
		expect(changeTexts.some((t) => t?.includes('feature'))).toBe(true);
		expect(changeTexts.some((t) => t?.includes('high'))).toBe(true);
	});

	it('does not show changes when type and priority match', () => {
		const { container } = renderComponent((ws) => {
			ws.type = 'bug';
			ws.priority = 'medium';
			ws.setAISuggestion({
				improved_description: 'Better description',
				suggested_type: 'bug',
				suggested_priority: 'medium',
				reasoning: 'Only text improved',
			});
		});
		const changes = container.querySelector('.beacon-ai-assist-changes');
		expect(changes).toBeNull();
	});

	it('shows only type change when priority matches', () => {
		const { container } = renderComponent((ws) => {
			ws.type = 'bug';
			ws.priority = 'high';
			ws.setAISuggestion({
				improved_description: 'Better description',
				suggested_type: 'feature',
				suggested_priority: 'high',
				reasoning: 'Reclassified',
			});
		});
		const changes = container.querySelectorAll('.beacon-ai-assist-change');
		expect(changes.length).toBe(1);
		expect(changes[0]!.textContent).toContain('feature');
	});

	it('has Accept and Dismiss buttons in suggestion', () => {
		const { container } = renderComponent((ws) => {
			ws.setAISuggestion({
				improved_description: 'Better',
				suggested_type: 'bug',
				suggested_priority: 'medium',
				reasoning: 'Ok',
			});
		});
		const actions = container.querySelectorAll('.beacon-ai-assist-action-btn');
		expect(actions.length).toBe(2);
		expect(actions[0]!.textContent).toContain('Dismiss');
		expect(actions[1]!.textContent).toContain('Accept');
	});

	it('shows error state with retry button', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'This is a long enough description';
			ws.setAIError('Something went wrong');
		});
		const error = container.querySelector('.beacon-ai-assist-error');
		expect(error).not.toBeNull();
		expect(error!.textContent).toContain('Something went wrong');
		const retryBtn = container.querySelector('.beacon-ai-assist-btn');
		expect(retryBtn).not.toBeNull();
		expect(retryBtn!.textContent).toContain('Retry');
	});

	it('shows error text in error state', () => {
		const { container } = renderComponent((ws) => {
			ws.setAIError('API rate limit exceeded');
		});
		const errorText = container.querySelector('.beacon-ai-assist-error-text');
		expect(errorText).not.toBeNull();
		expect(errorText!.textContent).toBe('API rate limit exceeded');
	});

	it('disables retry button when description is too short in error state', () => {
		const { container } = renderComponent((ws) => {
			ws.description = 'short';
			ws.setAIError('Failed');
		});
		const retryBtn = container.querySelector('.beacon-ai-assist-btn') as HTMLButtonElement;
		expect(retryBtn.disabled).toBe(true);
	});

	it('renders within the beacon-ai-assist wrapper', () => {
		const { container } = renderComponent();
		expect(container.querySelector('.beacon-ai-assist')).not.toBeNull();
	});
});
