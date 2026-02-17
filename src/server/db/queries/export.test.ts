import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@libsql/client';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createTestDB, createTempDir, removeTempDir } from '../../../../test/helpers.js';
import { createTaskData } from '../../../../test/mocks/factories.js';
import { createTask } from './tasks.js';
import { createAttachment } from './attachments.js';
import { createAdminNote } from './admin-notes.js';
import { exportTask, exportTasks } from './export.js';

describe('export queries', () => {
	let db: Client;

	beforeEach(async () => {
		db = await createTestDB();
	});

	afterEach(() => {
		db.close();
	});

	describe('exportTask', () => {
		it('returns correct structure for a single task', async () => {
			const task = await createTask(db, createTaskData({
				type: 'bug',
				priority: 'high',
				description: 'Login button broken',
				route: '/login',
				user_email: 'reporter@example.com',
			}));

			const exported = await exportTask(db, task.id);

			expect(exported).not.toBeNull();
			expect(exported!.public_id).toBe(task.public_id);
			expect(exported!.type).toBe('bug');
			expect(exported!.priority).toBe('high');
			expect(exported!.status).toBe('new');
			expect(exported!.description).toBe('Login button broken');
			expect(exported!.route).toBe('/login');
			expect(exported!.element_selector).toBeNull();
			expect(exported!.metadata).toBeNull();
			expect(exported!.user_email).toBe('reporter@example.com');
			expect(exported!.created_at).toBeDefined();
			expect(exported!.updated_at).toBeDefined();
			expect(exported!.admin_notes).toEqual([]);
			expect(exported!.attachments).toEqual([]);
		});

		it('returns null for nonexistent task', async () => {
			const exported = await exportTask(db, 'nonexistent-id');

			expect(exported).toBeNull();
		});

		it('includes admin notes in exported task', async () => {
			const task = await createTask(db, createTaskData());

			await createAdminNote(db, {
				task_id: task.id,
				content: 'First note',
				author_email: 'admin@example.com',
			});
			await createAdminNote(db, {
				task_id: task.id,
				content: 'Second note',
			});

			const exported = await exportTask(db, task.id);

			expect(exported).not.toBeNull();
			expect(exported!.admin_notes).toHaveLength(2);
			expect(exported!.admin_notes[0]).toEqual({
				content: 'First note',
				author_email: 'admin@example.com',
			});
			expect(exported!.admin_notes[1]).toEqual({
				content: 'Second note',
				author_email: null,
			});
		});

		it('includes attachments with base64-encoded file data', async () => {
			const tmpDir = await createTempDir();

			try {
				const task = await createTask(db, createTaskData());
				const filePath = join(tmpDir, 'screenshot.png');
				const fileContent = Buffer.from('fake-png-content');
				await writeFile(filePath, fileContent);

				await createAttachment(db, {
					task_id: task.id,
					type: 'screenshot',
					filename: 'screenshot.png',
					path: filePath,
					mime_type: 'image/png',
					size_bytes: fileContent.length,
				});

				const exported = await exportTask(db, task.id);

				expect(exported).not.toBeNull();
				expect(exported!.attachments).toHaveLength(1);
				expect(exported!.attachments[0]!.filename).toBe('screenshot.png');
				expect(exported!.attachments[0]!.type).toBe('screenshot');
				expect(exported!.attachments[0]!.mime_type).toBe('image/png');
				expect(exported!.attachments[0]!.data).toBe(fileContent.toString('base64'));
			} finally {
				await removeTempDir(tmpDir);
			}
		});

		it('gracefully skips attachments whose files are missing on disk', async () => {
			const task = await createTask(db, createTaskData());

			// Create an attachment record pointing to a non-existent file
			await createAttachment(db, {
				task_id: task.id,
				type: 'screenshot',
				filename: 'missing.png',
				path: '/tmp/this-file-does-not-exist-anywhere.png',
				mime_type: 'image/png',
				size_bytes: 1024,
			});

			const exported = await exportTask(db, task.id);

			expect(exported).not.toBeNull();
			// The attachment record exists but the file is missing,
			// so it should be excluded from the export
			expect(exported!.attachments).toEqual([]);
		});
	});

	describe('exportTasks', () => {
		it('filters by status', async () => {
			const task1 = await createTask(db, createTaskData({ description: 'Backlog task' }));
			await createTask(db, createTaskData({ description: 'New task' }));

			// Move task1 to backlog
			await db.execute({
				sql: "UPDATE tasks SET status = 'backlog' WHERE id = ?",
				args: [task1.id],
			});

			const exported = await exportTasks(db, { status: 'backlog' });

			expect(exported).toHaveLength(1);
			expect(exported[0]!.description).toBe('Backlog task');
			expect(exported[0]!.status).toBe('backlog');
		});

		it('filters by public_id', async () => {
			await createTask(db, createTaskData({ description: 'First task' }));
			await createTask(db, createTaskData({ description: 'Second task' }));
			await createTask(db, createTaskData({ description: 'Third task' }));

			const exported = await exportTasks(db, { public_id: 2 });

			expect(exported).toHaveLength(1);
			expect(exported[0]!.public_id).toBe(2);
			expect(exported[0]!.description).toBe('Second task');
		});

		it('returns empty array when no tasks match', async () => {
			await createTask(db, createTaskData());

			const exported = await exportTasks(db, { status: 'closed' });

			expect(exported).toEqual([]);
		});
	});
});
