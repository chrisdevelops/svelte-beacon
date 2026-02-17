import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from './tasks.js';
import { createAdminNote, getAdminNotesByTaskId, deleteAdminNotesByTaskId } from './admin-notes.js';

describe('admin-notes queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('createAdminNote', () => {
		it('creates admin note with all fields', async () => {
			const task = await createTask(db, createTaskData());

			const note = await createAdminNote(db, {
				task_id: task.id,
				content: 'This needs investigation',
				author_email: 'admin@example.com',
			});

			expect(note.id).toBeDefined();
			expect(note.task_id).toBe(task.id);
			expect(note.content).toBe('This needs investigation');
			expect(note.author_email).toBe('admin@example.com');
			expect(note.created_at).toBeDefined();
		});

		it('creates admin note with null author_email', async () => {
			const task = await createTask(db, createTaskData());

			const note = await createAdminNote(db, {
				task_id: task.id,
				content: 'Anonymous note',
			});

			expect(note.id).toBeDefined();
			expect(note.content).toBe('Anonymous note');
			expect(note.author_email).toBeNull();
		});
	});

	describe('getAdminNotesByTaskId', () => {
		it('returns empty array when no notes exist', async () => {
			const task = await createTask(db, createTaskData());

			const result = await getAdminNotesByTaskId(db, task.id);

			expect(result).toEqual([]);
		});

		it('returns notes ordered by created_at ascending', async () => {
			const task = await createTask(db, createTaskData());

			await createAdminNote(db, {
				task_id: task.id,
				content: 'First note',
				author_email: 'admin@example.com',
			});

			// Small delay to ensure different timestamps
			await new Promise((r) => setTimeout(r, 50));

			await createAdminNote(db, {
				task_id: task.id,
				content: 'Second note',
				author_email: 'admin@example.com',
			});

			const result = await getAdminNotesByTaskId(db, task.id);

			expect(result).toHaveLength(2);
			expect(result[0]!.content).toBe('First note');
			expect(result[1]!.content).toBe('Second note');
		});

		it('only returns notes for the given task', async () => {
			const task1 = await createTask(db, createTaskData());
			const task2 = await createTask(db, createTaskData());

			await createAdminNote(db, {
				task_id: task1.id,
				content: 'Note for task 1',
			});

			await createAdminNote(db, {
				task_id: task2.id,
				content: 'Note for task 2',
			});

			const result = await getAdminNotesByTaskId(db, task1.id);

			expect(result).toHaveLength(1);
			expect(result[0]!.task_id).toBe(task1.id);
			expect(result[0]!.content).toBe('Note for task 1');
		});
	});

	describe('deleteAdminNotesByTaskId', () => {
		it('removes all notes for a task', async () => {
			const task = await createTask(db, createTaskData());

			await createAdminNote(db, {
				task_id: task.id,
				content: 'Note one',
			});

			await createAdminNote(db, {
				task_id: task.id,
				content: 'Note two',
			});

			// Verify notes exist before deletion
			const before = await getAdminNotesByTaskId(db, task.id);
			expect(before).toHaveLength(2);

			await deleteAdminNotesByTaskId(db, task.id);

			const after = await getAdminNotesByTaskId(db, task.id);
			expect(after).toEqual([]);
		});
	});
});
