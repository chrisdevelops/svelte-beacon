import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import LogDetailModal from '$lib/components/LogDetailModal.svelte';
import { createMockAILogEntry } from './factories.js';

beforeEach(() => {
	vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	}));
	// Mock HTMLDialogElement.showModal since jsdom doesn't support it
	HTMLDialogElement.prototype.showModal = vi.fn();
	HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('LogDetailModal', () => {
	it('renders entry details: timestamp, level, and message', () => {
		const entry = createMockAILogEntry({
			level: 'progress',
			message: 'Analyzing the API handlers',
			created_at: '2026-01-15T10:00:00.000Z',
		});

		const { container } = render(LogDetailModal, {
			props: { entry, onclose: vi.fn() },
		});

		expect(container.textContent).toContain('progress');
		expect(container.textContent).toContain('Analyzing the API handlers');
		// Should call showModal on the dialog
		expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
	});

	it('shows tool name from metadata', () => {
		const entry = createMockAILogEntry({
			level: 'info',
			message: 'Reading file',
			metadata: { tool: 'Read' },
		});

		const { container } = render(LogDetailModal, {
			props: { entry, onclose: vi.fn() },
		});

		const toolBadge = container.querySelector('.tool-badge');
		expect(toolBadge).not.toBeNull();
		expect(toolBadge!.textContent).toBe('Read');
	});

	it('calls onclose on close button click', () => {
		const onclose = vi.fn();
		const entry = createMockAILogEntry({ message: 'Test message' });

		const { container } = render(LogDetailModal, {
			props: { entry, onclose },
		});

		const closeBtn = container.querySelector('[aria-label="Close"]') as HTMLButtonElement;
		expect(closeBtn).not.toBeNull();
		closeBtn.click();
		expect(onclose).toHaveBeenCalled();
	});

	it('copies entry text to clipboard', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', {
			clipboard: { writeText },
		});

		const entry = createMockAILogEntry({
			level: 'error',
			message: 'Something went wrong',
			metadata: { tool: 'Bash' },
			created_at: '2026-01-15T10:00:00.000Z',
		});

		const { container } = render(LogDetailModal, {
			props: { entry, onclose: vi.fn() },
		});

		const copyBtn = container.querySelector('.copy-button') as HTMLButtonElement;
		expect(copyBtn).not.toBeNull();
		expect(copyBtn.textContent).toBe('Copy');

		copyBtn.click();

		await vi.waitFor(() => {
			expect(writeText).toHaveBeenCalled();
		});

		// Verify clipboard content contains the key pieces
		const clipboardText = writeText.mock.calls[0][0] as string;
		expect(clipboardText).toContain('Level: error');
		expect(clipboardText).toContain('Tool: Bash');
		expect(clipboardText).toContain('Something went wrong');

		// Button should show "Copied!" feedback
		await vi.waitFor(() => {
			expect(copyBtn.textContent).toBe('Copied!');
		});
	});
});
