import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import NotesTab from '$lib/components/NotesTab.svelte';
import { createMockTaskDetail, createMockAdminNote } from './factories.js';
import type { TaskDetail } from '$lib/types.js';

vi.mock('$lib/api.js', () => ({
	api: {
		addNote: vi.fn(),
		getTask: vi.fn(),
	},
}));

afterEach(cleanup);

describe('NotesTab', () => {
	it('renders empty state when no notes', () => {
		const task = createMockTaskDetail({ admin_notes: [] });
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('No notes yet');
	});

	it('renders notes with content', () => {
		const task = createMockTaskDetail({
			admin_notes: [createMockAdminNote({ content: 'This is a test note' })],
		});
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('This is a test note');
	});

	it('renders author email', () => {
		const task = createMockTaskDetail({
			admin_notes: [createMockAdminNote({ author_email: 'admin@example.com' })],
		});
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('admin@example.com');
	});

	it('renders Anonymous for null author', () => {
		const task = createMockTaskDetail({
			admin_notes: [createMockAdminNote({ author_email: null })],
		});
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('Anonymous');
	});

	it('renders textarea and submit button', () => {
		const task = createMockTaskDetail();
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.querySelector('textarea')).not.toBeNull();
		expect(container.querySelector('button[type="submit"]')).not.toBeNull();
	});

	it('disables submit button when content is empty', () => {
		const task = createMockTaskDetail();
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		const button = container.querySelector('button[type="submit"]') as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('renders multiple notes', () => {
		const task = createMockTaskDetail({
			admin_notes: [
				createMockAdminNote({ content: 'First note' }),
				createMockAdminNote({ content: 'Second note' }),
			],
		});
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).toContain('First note');
		expect(container.textContent).toContain('Second note');
		expect(container.querySelectorAll('.note-item')).toHaveLength(2);
	});

	it('hides empty state when notes exist', () => {
		const task = createMockTaskDetail({
			admin_notes: [createMockAdminNote()],
		});
		const { container } = render(NotesTab, {
			props: { task, onupdated: vi.fn() },
		});
		expect(container.textContent).not.toContain('No notes yet');
	});
});
