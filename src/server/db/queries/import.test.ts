import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { createTestDB } from '../../../../test/helpers.js';
import { importTask, importAttachment, importAdminNote, replaceAdminNotes } from './import.js';
import { getAdminNotesByTaskId } from './admin-notes.js';
import { query } from '../helpers.js';
import type { ImportTaskInput } from '../../types.js';

function makeImportInput(overrides?: Partial<ImportTaskInput>): ImportTaskInput {
	return {
		origin: 'https://prod.example.com',
		remote_id: 'remote-task-001',
		type: 'bug',
		priority: 'high',
		status: 'new',
		description: 'Button does not respond on mobile',
		route: '/dashboard',
		element_selector: null,
		metadata: null,
		user_email: 'user@example.com',
		...overrides,
	};
}

describe('import queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('importTask', () => {
		it('creates a new task with origin and remote_id', async () => {
			const input = makeImportInput();

			const task = await importTask(db, input);

			expect(task.id).toBeDefined();
			expect(task.id.length).toBeGreaterThan(0);
			expect(task.public_id).toBeGreaterThanOrEqual(1);
			expect(task.origin).toBe('https://prod.example.com');
			expect(task.remote_id).toBe('remote-task-001');
			expect(task.type).toBe('bug');
			expect(task.priority).toBe('high');
			expect(task.status).toBe('new');
			expect(task.description).toBe('Button does not respond on mobile');
			expect(task.route).toBe('/dashboard');
			expect(task.user_email).toBe('user@example.com');
			expect(task.created_at).toBeDefined();
			expect(task.updated_at).toBeDefined();
		});

		it('updates existing task with same origin and remote_id', async () => {
			const input = makeImportInput();
			const original = await importTask(db, input);

			const updatedInput = makeImportInput({
				description: 'Updated description after re-import',
				priority: 'critical',
				status: 'backlog',
			});

			const updated = await importTask(db, updatedInput);

			expect(updated.id).toBe(original.id);
			expect(updated.description).toBe('Updated description after re-import');
			expect(updated.priority).toBe('critical');
			expect(updated.status).toBe('backlog');
		});

		it('preserves local public_id on update', async () => {
			const input = makeImportInput();
			const original = await importTask(db, input);
			const originalPublicId = original.public_id;

			const updatedInput = makeImportInput({
				description: 'Changed description',
			});

			const updated = await importTask(db, updatedInput);

			expect(updated.public_id).toBe(originalPublicId);
		});

		it('does not create duplicates on repeated import', async () => {
			const input = makeImportInput();

			await importTask(db, input);
			await importTask(db, input);

			const rows = await query(
				db,
				'SELECT * FROM tasks WHERE origin = ? AND remote_id = ?',
				[input.origin, input.remote_id],
			);

			expect(rows).toHaveLength(1);
		});
	});

	describe('importAttachment', () => {
		it('creates attachment record for imported task', async () => {
			const task = await importTask(db, makeImportInput());

			await importAttachment(
				db,
				task.id,
				'/storage/screenshots/capture.png',
				{
					filename: 'capture.png',
					type: 'screenshot',
					mime_type: 'image/png',
				},
				8192,
			);

			const rows = await query(
				db,
				'SELECT * FROM attachments WHERE task_id = ?',
				[task.id],
			);

			expect(rows).toHaveLength(1);
			const attachment = rows[0]!;
			expect(attachment['task_id']).toBe(task.id);
			expect(attachment['filename']).toBe('capture.png');
			expect(attachment['type']).toBe('screenshot');
			expect(attachment['mime_type']).toBe('image/png');
			expect(attachment['path']).toBe('/storage/screenshots/capture.png');
			expect(Number(attachment['size_bytes'])).toBe(8192);
		});
	});

	describe('importAdminNote', () => {
		it('creates admin note for imported task', async () => {
			const task = await importTask(db, makeImportInput());

			await importAdminNote(db, task.id, {
				content: 'Confirmed reproducible on iOS Safari',
				author_email: 'admin@example.com',
			});

			const notes = await getAdminNotesByTaskId(db, task.id);

			expect(notes).toHaveLength(1);
			expect(notes[0]!.task_id).toBe(task.id);
			expect(notes[0]!.content).toBe('Confirmed reproducible on iOS Safari');
			expect(notes[0]!.author_email).toBe('admin@example.com');
		});
	});

	describe('replaceAdminNotes', () => {
		it('deletes existing notes and re-imports new ones', async () => {
			const task = await importTask(db, makeImportInput());

			// Create initial notes
			await importAdminNote(db, task.id, {
				content: 'Old note one',
				author_email: 'admin@example.com',
			});
			await importAdminNote(db, task.id, {
				content: 'Old note two',
				author_email: null,
			});

			const notesBefore = await getAdminNotesByTaskId(db, task.id);
			expect(notesBefore).toHaveLength(2);

			// Replace with new notes
			await replaceAdminNotes(db, task.id, [
				{ content: 'Fresh note alpha', author_email: 'new-admin@example.com' },
				{ content: 'Fresh note beta' },
				{ content: 'Fresh note gamma', author_email: null },
			]);

			const notesAfter = await getAdminNotesByTaskId(db, task.id);

			expect(notesAfter).toHaveLength(3);
			expect(notesAfter[0]!.content).toBe('Fresh note alpha');
			expect(notesAfter[0]!.author_email).toBe('new-admin@example.com');
			expect(notesAfter[1]!.content).toBe('Fresh note beta');
			expect(notesAfter[2]!.content).toBe('Fresh note gamma');

			// Verify old notes are gone
			const allContents = notesAfter.map((n) => n.content);
			expect(allContents).not.toContain('Old note one');
			expect(allContents).not.toContain('Old note two');
		});
	});
});
